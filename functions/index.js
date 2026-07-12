/* global process */
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

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
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
