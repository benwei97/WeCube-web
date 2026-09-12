/* global process */
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

admin.initializeApp();
const firestore = admin.firestore();

const awsAccessKeyId = defineSecret("AWS_ACCESS_KEY_ID");
const awsSecretAccessKey = defineSecret("AWS_SECRET_ACCESS_KEY");

const functionOptions = {
  region: "us-central1",
  secrets: [awsAccessKeyId, awsSecretAccessKey],
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_EXPIRES_SECONDS = 5 * 60;
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const pushFunctionOptions = { region: "us-central1" };

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to upload images.");
  }

  return request.auth.uid;
}

function getBucketName() {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new HttpsError("failed-precondition", "S3 bucket is not configured.");
  }

  return bucketName;
}

function getAwsRegion() {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new HttpsError("failed-precondition", "AWS region is not configured.");
  }

  return region;
}

function createS3Client() {
  return new S3Client({
    region: getAwsRegion(),
    credentials: {
      accessKeyId: awsAccessKeyId.value(),
      secretAccessKey: awsSecretAccessKey.value(),
    },
  });
}

function sanitizeExtension(extension) {
  const normalized = String(extension || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (normalized === "jpg") {
    return "jpeg";
  }

  if (["jpeg", "png", "webp"].includes(normalized)) {
    return normalized;
  }

  return "png";
}

function sanitizeMetadataValue(value) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 256);
}

function truncateNotificationText(value, maxLength = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function getUserDisplayName(user = {}) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.displayName ||
    "Someone"
  );
}

function getRecipientId(conversation = {}, senderId) {
  if (conversation.buyerId === senderId) return conversation.sellerId;
  if (conversation.sellerId === senderId) return conversation.buyerId;
  return "";
}

function getUserBlockDocumentId(blockerId, blockedUserId) {
  return `${blockerId}_${blockedUserId}`;
}

async function isBlockedBetween(firstUserId, secondUserId) {
  if (!firstUserId || !secondUserId) return true;

  const [firstBlocksSecond, secondBlocksFirst] = await Promise.all([
    firestore
      .collection("userBlocks")
      .doc(getUserBlockDocumentId(firstUserId, secondUserId))
      .get(),
    firestore
      .collection("userBlocks")
      .doc(getUserBlockDocumentId(secondUserId, firstUserId))
      .get(),
  ]);

  return firstBlocksSecond.exists || secondBlocksFirst.exists;
}

async function deletePushTokenDocs(tokenDocs = []) {
  if (!tokenDocs.length) return;

  const batch = firestore.batch();
  tokenDocs.forEach((tokenDoc) => batch.delete(tokenDoc.ref));
  await batch.commit();
}

async function sendExpoPushNotifications(messages) {
  if (!messages.length) return [];

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo push request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function assertImageRequest({ contentType, fileSize }) {
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new HttpsError("invalid-argument", "Upload a JPG, PNG, or WebP image.");
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new HttpsError("invalid-argument", "Image size is invalid.");
  }

  if (fileSize > MAX_IMAGE_SIZE_BYTES) {
    throw new HttpsError("invalid-argument", "Images must be 10 MB or smaller.");
  }
}

function assertSafeId(value, label) {
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(String(value || ""))) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
}

function assertSafeS3Key(key, uid) {
  const value = String(key || "");
  const isSafeShape =
    value.length <= 512 &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    /^[A-Za-z0-9!_.*'()/=-]+$/.test(value);
  const isAllowedPrefix =
    value.startsWith(`avatars/${uid}/`) || value.startsWith("listings/");

  if (!isSafeShape || !isAllowedPrefix) {
    throw new HttpsError("permission-denied", "S3 object key is not allowed.");
  }

  return value;
}

function getListingUploadIdFromKey(s3Key) {
  const match = String(s3Key).match(/^listings\/([^/]+)\//);
  return match?.[1] || null;
}

async function assertCanDeleteS3Key(s3Key, uid) {
  if (s3Key.startsWith(`avatars/${uid}/`)) {
    return;
  }

  const listingUploadId = getListingUploadIdFromKey(s3Key);
  if (!listingUploadId) {
    throw new HttpsError("permission-denied", "S3 object key is not allowed.");
  }

  const listingSnapshot = await firestore
    .collection("listings")
    .where("listingId", "==", listingUploadId)
    .where("userId", "==", uid)
    .limit(1)
    .get();

  if (listingSnapshot.empty) {
    throw new HttpsError(
      "permission-denied",
      "You can only delete images for your own listings."
    );
  }
}

async function createListingImageKey({ listingId, fileExtension }) {
  assertSafeId(listingId, "Listing ID");
  const extension = sanitizeExtension(fileExtension);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `listings/${listingId}/${Date.now()}-${randomSuffix}.${extension}`;
}

function createAvatarImageKey({ uid, userId, fileExtension }) {
  if (userId !== uid) {
    throw new HttpsError("permission-denied", "You can only upload your own avatar.");
  }

  assertSafeId(userId, "User ID");
  const extension = sanitizeExtension(fileExtension);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `avatars/${uid}/${Date.now()}-${randomSuffix}.${extension}`;
}

export const createSignedS3Upload = onCall(functionOptions, async (request) => {
  const uid = requireAuth(request);
  const {
    uploadType,
    listingId,
    userId,
    fileName,
    contentType,
    fileExtension,
    fileSize,
  } = request.data || {};

  if (!["avatar", "listing"].includes(uploadType)) {
    throw new HttpsError("invalid-argument", "Upload type is invalid.");
  }

  assertImageRequest({ contentType, fileSize: Number(fileSize) });

  const bucketName = getBucketName();
  const s3Key =
    uploadType === "avatar"
      ? createAvatarImageKey({ uid, userId, fileExtension })
      : await createListingImageKey({ listingId, fileExtension });

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ContentType: contentType,
    Metadata: {
      "uploaded-by": uid,
      "upload-type": sanitizeMetadataValue(uploadType || "listing"),
      "original-name": sanitizeMetadataValue(fileName),
      ...(listingId ? { "listing-id": sanitizeMetadataValue(listingId) } : {}),
      ...(userId ? { "user-id": sanitizeMetadataValue(userId) } : {}),
    },
  });

  const s3Client = createS3Client();

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: SIGNED_URL_EXPIRES_SECONDS,
  });

  return {
    uploadUrl,
    s3Key,
    expiresIn: SIGNED_URL_EXPIRES_SECONDS,
  };
});

export const deleteS3Objects = onCall(functionOptions, async (request) => {
  const uid = requireAuth(request);
  const bucketName = getBucketName();
  const s3Keys = Array.isArray(request.data?.s3Keys) ? request.data.s3Keys : [];

  if (s3Keys.length === 0) {
    return { deleted: 0 };
  }

  if (s3Keys.length > 25) {
    throw new HttpsError("invalid-argument", "Too many objects to delete.");
  }

  const safeKeys = s3Keys.map((key) => assertSafeS3Key(key, uid));
  await Promise.all(safeKeys.map((key) => assertCanDeleteS3Key(key, uid)));

  const s3Client = createS3Client();

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: safeKeys.map((Key) => ({ Key })),
        Quiet: true,
      },
    })
  );

  return { deleted: safeKeys.length };
});

export const sendMessagePushNotification = onDocumentCreated(
  {
    ...pushFunctionOptions,
    document: "messages/{messageId}",
  },
  async (event) => {
    const message = event.data?.data();
    if (!message?.conversationId || !message?.senderId) return;
    if (message.type !== "message" && !message.reviewPrompt) return;

    const conversationSnapshot = await firestore
      .collection("conversations")
      .doc(message.conversationId)
      .get();
    if (!conversationSnapshot.exists) return;

    const conversation = conversationSnapshot.data();
    const recipientId = getRecipientId(conversation, message.senderId);
    if (!recipientId || recipientId === message.senderId) return;
    if (conversation.status === "rejected" || conversation.closedReason === "listing_deleted") {
      return;
    }
    if (await isBlockedBetween(conversation.buyerId, conversation.sellerId)) {
      return;
    }

    const recipientSnapshot = await firestore.collection("users").doc(recipientId).get();
    const recipient = recipientSnapshot.exists ? recipientSnapshot.data() : {};
    if (recipient.notificationSettings?.messages === false) return;

    const tokenSnapshot = await firestore
      .collection("users")
      .doc(recipientId)
      .collection("pushTokens")
      .where("disabled", "==", false)
      .get();
    if (tokenSnapshot.empty) return;

    const [senderSnapshot, listingSnapshot] = await Promise.all([
      firestore.collection("users").doc(message.senderId).get(),
      conversation.listingId
        ? firestore.collection("listings").doc(conversation.listingId).get()
        : Promise.resolve(null),
    ]);
    const sender = senderSnapshot.exists ? senderSnapshot.data() : {};
    const listing = listingSnapshot?.exists ? listingSnapshot.data() : {};
    const senderName = getUserDisplayName(sender);
    const listingTitle = truncateNotificationText(listing.title || "a listing", 64);
    const title = message.reviewPrompt
      ? "Rate your WeCube experience"
      : `New message from ${truncateNotificationText(senderName, 40)}`;
    const body = message.reviewPrompt
      ? `About ${listingTitle}`
      : `About ${listingTitle}`;

    const validTokenDocs = tokenSnapshot.docs.filter((tokenDoc) => {
      const token = tokenDoc.data()?.token;
      return typeof token === "string" && token.startsWith("Expo");
    });
    const pushMessages = validTokenDocs.map((tokenDoc) => ({
      to: tokenDoc.data().token,
      sound: "default",
      title,
      body,
      data: {
        type: "message",
        conversationId: message.conversationId,
        listingId: conversation.listingId || "",
      },
    }));

    try {
      const tickets = await sendExpoPushNotifications(pushMessages);
      const invalidTokenDocs = tickets
        .map((ticket, index) =>
          ticket?.details?.error === "DeviceNotRegistered"
            ? validTokenDocs[index]
            : null
        )
        .filter(Boolean);

      await deletePushTokenDocs(invalidTokenDocs);
    } catch (error) {
      logger.error("Error sending message push notification", {
        conversationId: message.conversationId,
        messageId: event.params.messageId,
        error,
      });
    }
  }
);
