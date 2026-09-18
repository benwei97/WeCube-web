/* global process */
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import admin from "firebase-admin";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { isConversationUnread } from "./unreadConversations.js";

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
const AFFILIATE_ACTIVATION_AMOUNT = 1;
const AFFILIATE_FIRST_TRANSACTION_AMOUNT = 3;
const AFFILIATE_MAX_PER_REFERRED_USER = 4;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const pushFunctionOptions = { region: "us-central1" };
const affiliateFunctionOptions = { region: "us-central1" };

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to upload images.");
  }

  return request.auth.uid;
}

function requireAdmin(request) {
  const uid = requireAuth(request);
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Admin access is required.");
  }

  return uid;
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

async function getUnreadConversationCount(userId) {
  const snapshots = await Promise.all([
    firestore.collection("conversations").where("buyerId", "==", userId).get(),
    firestore.collection("conversations").where("sellerId", "==", userId).get(),
  ]);
  return snapshots.flatMap((snapshot) => snapshot.docs)
    .filter((conversationDoc) => isConversationUnread(conversationDoc.data(), userId)).length;
}

// Conversation writes also cover reads from web/another device and status changes.
export const syncMessageUnreadBadge = onDocumentWritten(
  { ...pushFunctionOptions, document: "conversations/{conversationId}" },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    for (const userId of new Set([
      before?.buyerId, before?.sellerId, after?.buyerId, after?.sellerId,
    ].filter(Boolean))) {
      if (isConversationUnread(before, userId) === isConversationUnread(after, userId)) continue;
      const [badge, tokens] = await Promise.all([
        getUnreadConversationCount(userId),
        firestore.collection("users").doc(userId).collection("pushTokens")
          .where("disabled", "==", false).get(),
      ]);
      const validTokens = tokens.docs.filter((tokenDoc) => tokenDoc.data().token?.startsWith("Expo"));
      const tickets = await sendExpoPushNotifications(validTokens.map((tokenDoc) => ({
        to: tokenDoc.data().token,
        badge,
      })));
      await deletePushTokenDocs(validTokens.filter((_, index) =>
        tickets[index]?.details?.error === "DeviceNotRegistered"
      ));
    }
  }
);

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string" || value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function sumNumericField(docs, field) {
  return docs.reduce((sum, item) => {
    const value = Number(item[field]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function getLastActivityMillis(userId, activityByUserId) {
  return activityByUserId.get(userId) || 0;
}

function normalizeAffiliateCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function getAffiliateEventId({ affiliateId, referredUserId, type }) {
  return `${affiliateId}_${referredUserId}_${type}`;
}

function isAffiliateActive(affiliate = {}) {
  return affiliate.status === "active";
}

async function getActiveAffiliateForUser(userId) {
  if (!userId) return null;

  const userSnapshot = await firestore.collection("users").doc(userId).get();
  if (!userSnapshot.exists) return null;

  const user = userSnapshot.data();
  const affiliateId = normalizeAffiliateCode(user.referredByAffiliateId);
  if (!affiliateId) return null;

  const affiliateSnapshot = await firestore.collection("affiliates").doc(affiliateId).get();
  if (!affiliateSnapshot.exists) return null;

  const affiliate = {
    id: affiliateSnapshot.id,
    ...affiliateSnapshot.data(),
  };
  if (!isAffiliateActive(affiliate)) return null;
  if (affiliate.userId && affiliate.userId === userId) return null;

  return {
    affiliate,
    referredUser: {
      id: userSnapshot.id,
      ...user,
    },
  };
}

async function createAffiliateLedgerEvent({
  affiliate,
  amount,
  referredUserId,
  type,
  metadata = {},
}) {
  if (!affiliate?.id || !referredUserId || !type) return false;

  const eventId = getAffiliateEventId({
    affiliateId: affiliate.id,
    referredUserId,
    type,
  });
  const eventRef = firestore.collection("affiliateEvents").doc(eventId);

  return firestore.runTransaction(async (transaction) => {
    const existingEvent = await transaction.get(eventRef);
    if (existingEvent.exists) return false;

    transaction.set(eventRef, {
      affiliateId: affiliate.id,
      affiliateCode: affiliate.code || affiliate.id,
      referredUserId,
      type,
      amount,
      status: "pending",
      commissionCurrency: "USD",
      rulesVersion: "2026-09-affiliate-v1",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...metadata,
    });

    return true;
  });
}

async function createAffiliateActivationEvent(userId, metadata = {}) {
  const attribution = await getActiveAffiliateForUser(userId);
  if (!attribution) return false;

  return createAffiliateLedgerEvent({
    affiliate: attribution.affiliate,
    amount: AFFILIATE_ACTIVATION_AMOUNT,
    referredUserId: userId,
    type: "activated_user",
    metadata,
  });
}

async function createAffiliateFirstTransactionEvent(userId, listing = {}, metadata = {}) {
  const attribution = await getActiveAffiliateForUser(userId);
  if (!attribution) return false;

  if (
    attribution.affiliate.userId &&
    [listing.userId, listing.buyerId].includes(attribution.affiliate.userId)
  ) {
    return false;
  }

  return createAffiliateLedgerEvent({
    affiliate: attribution.affiliate,
    amount: AFFILIATE_FIRST_TRANSACTION_AMOUNT,
    referredUserId: userId,
    type: "first_transaction",
    metadata: {
      listingId: metadata.listingId || "",
      saleEventId: listing.saleEventId || "",
      soldAt: listing.soldAt || null,
      listingPrice: Number(listing.price) || 0,
      sellerId: listing.userId || "",
      buyerId: listing.buyerId || "",
      ...metadata,
    },
  });
}

function summarizeAffiliateEvents(events = []) {
  return events.reduce(
    (summary, event) => {
      summary.totalEvents += 1;
      summary.totalAmount += Number(event.amount) || 0;
      summary.byStatus[event.status] =
        (summary.byStatus[event.status] || 0) + (Number(event.amount) || 0);
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
      if (event.status === "paid") {
        summary.paidAmount += Number(event.amount) || 0;
      } else if (event.status === "pending") {
        summary.pendingAmount += Number(event.amount) || 0;
      }
      return summary;
    },
    {
      totalEvents: 0,
      totalAmount: 0,
      pendingAmount: 0,
      paidAmount: 0,
      byStatus: {},
      byType: {},
    }
  );
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

export const getAdminMetrics = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);

  const [
    usersSnapshot,
    listingsSnapshot,
    conversationsSnapshot,
    messagesSnapshot,
    reviewsSnapshot,
    listingReportsSnapshot,
    userReportsSnapshot,
    conversationReportsSnapshot,
    revenueEventsSnapshot,
    shareEventsSnapshot,
    affiliatesSnapshot,
    affiliateEventsSnapshot,
  ] = await Promise.all([
    firestore.collection("users").get(),
    firestore.collection("listings").get(),
    firestore.collection("conversations").get(),
    firestore.collection("messages").get(),
    firestore.collection("reviews").get(),
    firestore.collection("listingReports").get(),
    firestore.collection("userReports").get(),
    firestore.collection("conversationReports").get(),
    firestore.collection("revenueEvents").get(),
    firestore.collection("shareEvents").get(),
    firestore.collection("affiliates").get(),
    firestore.collection("affiliateEvents").get(),
  ]);

  const users = usersSnapshot.docs.map((userDoc) => ({
    id: userDoc.id,
    ...userDoc.data(),
  }));
  const listings = listingsSnapshot.docs.map((listingDoc) => ({
    id: listingDoc.id,
    ...listingDoc.data(),
  }));
  const conversations = conversationsSnapshot.docs.map((conversationDoc) => ({
    id: conversationDoc.id,
    ...conversationDoc.data(),
  }));
  const messages = messagesSnapshot.docs.map((messageDoc) => ({
    id: messageDoc.id,
    ...messageDoc.data(),
  }));
  const reviews = reviewsSnapshot.docs.map((reviewDoc) => ({
    id: reviewDoc.id,
    ...reviewDoc.data(),
  }));
  const revenueEvents = revenueEventsSnapshot.docs.map((eventDoc) => ({
    id: eventDoc.id,
    ...eventDoc.data(),
  }));
  const shareEvents = shareEventsSnapshot.docs.map((eventDoc) => ({
    id: eventDoc.id,
    ...eventDoc.data(),
  }));
  const affiliateEvents = affiliateEventsSnapshot.docs.map((eventDoc) => ({
    id: eventDoc.id,
    ...eventDoc.data(),
  }));
  const affiliateSummary = summarizeAffiliateEvents(affiliateEvents);

  const activityByUserId = new Map();
  const addActivity = (userId, timestamp) => {
    if (!userId) return;
    const currentValue = activityByUserId.get(userId) || 0;
    activityByUserId.set(userId, Math.max(currentValue, getTimestampMillis(timestamp)));
  };

  const soldListings = listings.filter((listing) => listing.status === "sold");
  const activeListings = listings.filter((listing) => listing.status === "active");
  const pendingListings = listings.filter((listing) => listing.status === "archived");
  const hiddenListings = listings.filter((listing) => listing.moderationStatus === "hidden");
  const sellerTransactionCounts = {};
  const buyerTransactionCounts = {};

  listings.forEach((listing) => {
    addActivity(listing.userId, listing.updatedAt || listing.createdAt);
    if (Array.isArray(listing.savedByUserIds)) {
      listing.savedByUserIds.forEach((userId) => addActivity(userId, listing.updatedAt));
    }

    if (listing.status !== "sold") return;
    if (listing.userId) {
      sellerTransactionCounts[listing.userId] =
        (sellerTransactionCounts[listing.userId] || 0) + 1;
    }
    if (listing.buyerId) {
      buyerTransactionCounts[listing.buyerId] =
        (buyerTransactionCounts[listing.buyerId] || 0) + 1;
    }
  });

  conversations.forEach((conversation) => {
    addActivity(conversation.buyerId, conversation.updatedAt || conversation.createdAt);
    addActivity(conversation.sellerId, conversation.updatedAt || conversation.createdAt);
  });

  messages.forEach((message) => {
    addActivity(message.senderId, message.createdAt);
  });

  reviews.forEach((review) => {
    addActivity(review.reviewerId, review.updatedAt || review.createdAt);
    addActivity(review.recipientId, review.updatedAt || review.createdAt);
  });

  users.forEach((user) => {
    if (Array.isArray(user.savedListings) && user.savedListings.length > 0) {
      addActivity(user.id, user.updatedAt || user.createdAt);
    }
    if (
      Array.isArray(user.attendingCompetitions) &&
      user.attendingCompetitions.length > 0
    ) {
      addActivity(user.id, user.updatedAt || user.createdAt);
    }
  });

  const deletedUserCount = users.filter((user) => user.deletedAt || user.deletedByUser).length;
  const realUsers = users.filter(
    (user) =>
      !user.deletedAt &&
      !user.deletedByUser &&
      !user.isTestAccount &&
      !user.isAdmin &&
      getLastActivityMillis(user.id, activityByUserId) > 0
  );
  const transactionUserIds = new Set([
    ...Object.keys(sellerTransactionCounts),
    ...Object.keys(buyerTransactionCounts),
  ]);
  const repeatTransactionUsers = [...transactionUserIds].filter((userId) => {
    const totalTransactions =
      (sellerTransactionCounts[userId] || 0) + (buyerTransactionCounts[userId] || 0);
    return totalTransactions >= 2;
  });

  const reportCounts = {
    listing: listingReportsSnapshot.size,
    user: userReportsSnapshot.size,
    conversation: conversationReportsSnapshot.size,
  };
  const openReportCount = [
    ...listingReportsSnapshot.docs,
    ...userReportsSnapshot.docs,
    ...conversationReportsSnapshot.docs,
  ].filter((reportDoc) => reportDoc.data().status === "open").length;

  const savedListingCount = users.reduce(
    (sum, user) => sum + (Array.isArray(user.savedListings) ? user.savedListings.length : 0),
    0
  );
  const savedCompetitionCount = users.reduce(
    (sum, user) =>
      sum +
      (Array.isArray(user.attendingCompetitions)
        ? user.attendingCompetitions.length
        : 0),
    0
  );
  const organicSignupCount = users.filter((user) =>
    ["organic", "friend", "word_of_mouth", "social"].includes(user.referralSource)
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    goals: {
      realUsers: { current: realUsers.length, target: 1000 },
      transactions: { current: soldListings.length, target: 250 },
      gmv: { current: sumNumericField(soldListings, "price"), target: 10000 },
      repeatTransactionUsers: {
        current: repeatTransactionUsers.length,
        target: 50,
      },
      lifetimeRevenue: {
        current: sumNumericField(revenueEvents, "amount"),
        target: 1000,
        source: revenueEvents.length > 0 ? "revenueEvents" : "not_configured",
      },
      organicSignals: {
        current: organicSignupCount + shareEvents.length,
        target: 1,
        source:
          organicSignupCount + shareEvents.length > 0
            ? "referralSource/shareEvents"
            : "not_configured",
      },
    },
    marketplace: {
      users: {
        total: users.length,
        real: realUsers.length,
        deleted: deletedUserCount,
      },
      listings: {
        total: listings.length,
        active: activeListings.length,
        pending: pendingListings.length,
        sold: soldListings.length,
        hidden: hiddenListings.length,
      },
      transactions: {
        completed: soldListings.length,
        estimatedGmv: sumNumericField(soldListings, "price"),
        uniqueSellers: Object.keys(sellerTransactionCounts).length,
        uniqueBuyers: Object.keys(buyerTransactionCounts).length,
        repeatUsers: repeatTransactionUsers.length,
      },
      messaging: {
        conversations: conversations.length,
        messages: messages.length,
      },
      trust: {
        reviews: reviews.length,
        reports:
          reportCounts.listing + reportCounts.user + reportCounts.conversation,
        openReports: openReportCount,
        reportCounts,
      },
      engagement: {
        savedListings: savedListingCount,
        savedCompetitions: savedCompetitionCount,
        shareEvents: shareEvents.length,
        organicSignups: organicSignupCount,
      },
      revenue: {
        lifetime: sumNumericField(revenueEvents, "amount"),
        events: revenueEvents.length,
      },
      affiliates: {
        total: affiliatesSnapshot.size,
        events: affiliateSummary.totalEvents,
        pendingPayout: affiliateSummary.pendingAmount,
        paidPayout: affiliateSummary.paidAmount,
      },
    },
  };
});

export const getAdminAffiliates = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);

  const [affiliatesSnapshot, eventsSnapshot, usersSnapshot] = await Promise.all([
    firestore.collection("affiliates").get(),
    firestore.collection("affiliateEvents").get(),
    firestore.collection("users").get(),
  ]);

  const usersById = new Map(
    usersSnapshot.docs.map((userDoc) => [userDoc.id, { id: userDoc.id, ...userDoc.data() }])
  );
  const events = eventsSnapshot.docs.map((eventDoc) => ({
    id: eventDoc.id,
    ...eventDoc.data(),
  }));
  const eventsByAffiliateId = new Map();

  events.forEach((event) => {
    const currentEvents = eventsByAffiliateId.get(event.affiliateId) || [];
    currentEvents.push(event);
    eventsByAffiliateId.set(event.affiliateId, currentEvents);
  });

  const affiliates = affiliatesSnapshot.docs
    .map((affiliateDoc) => {
      const affiliate = { id: affiliateDoc.id, ...affiliateDoc.data() };
      const affiliateEvents = eventsByAffiliateId.get(affiliateDoc.id) || [];
      const referredUsers = usersSnapshot.docs.filter(
        (userDoc) => normalizeAffiliateCode(userDoc.data().referredByAffiliateId) === affiliateDoc.id
      );

      return {
        ...affiliate,
        summary: {
          ...summarizeAffiliateEvents(affiliateEvents),
          signups: referredUsers.length,
          activatedUsers: new Set(
            affiliateEvents
              .filter((event) => event.type === "activated_user")
              .map((event) => event.referredUserId)
          ).size,
          firstTransactions: affiliateEvents.filter(
            (event) => event.type === "first_transaction"
          ).length,
        },
      };
    })
    .sort((a, b) => {
      const aTime = getTimestampMillis(a.createdAt);
      const bTime = getTimestampMillis(b.createdAt);
      return bTime - aTime;
    });

  const recentEvents = events
    .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
    .slice(0, 100)
    .map((event) => {
      const user = usersById.get(event.referredUserId) || {};
      return {
        ...event,
        referredUserName: getUserDisplayName(user),
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    affiliates,
    events: recentEvents,
    totals: summarizeAffiliateEvents(events),
  };
});

export const saveAffiliate = onCall({ region: "us-central1" }, async (request) => {
  const adminUid = requireAdmin(request);
  const affiliateId = normalizeAffiliateCode(request.data?.code);
  const displayName = String(request.data?.displayName || "").trim().slice(0, 80);
  const userId = String(request.data?.userId || "").trim();
  const status = request.data?.status === "disabled" ? "disabled" : "active";

  if (!affiliateId) {
    throw new HttpsError("invalid-argument", "Affiliate code is required.");
  }
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Display name is required.");
  }

  const affiliateRef = firestore.collection("affiliates").doc(affiliateId);
  const affiliateSnapshot = await affiliateRef.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await affiliateRef.set(
    {
      code: affiliateId,
      displayName,
      userId,
      status,
      activationAmount: AFFILIATE_ACTIVATION_AMOUNT,
      firstTransactionAmount: AFFILIATE_FIRST_TRANSACTION_AMOUNT,
      maxPerReferredUser: AFFILIATE_MAX_PER_REFERRED_USER,
      updatedAt: now,
      updatedBy: adminUid,
      ...(affiliateSnapshot.exists
        ? {}
        : {
            createdAt: now,
            createdBy: adminUid,
          }),
    },
    { merge: true }
  );

  return { affiliateId };
});

export const markAffiliateEventsPaid = onCall(
  { region: "us-central1" },
  async (request) => {
    const adminUid = requireAdmin(request);
    const affiliateId = normalizeAffiliateCode(request.data?.affiliateId);

    if (!affiliateId) {
      throw new HttpsError("invalid-argument", "Affiliate id is required.");
    }

    const pendingEventsSnapshot = await firestore
      .collection("affiliateEvents")
      .where("affiliateId", "==", affiliateId)
      .where("status", "==", "pending")
      .get();

    if (pendingEventsSnapshot.empty) {
      return { updated: 0 };
    }

    const batch = firestore.batch();
    pendingEventsSnapshot.docs.forEach((eventDoc) => {
      batch.update(eventDoc.ref, {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: adminUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    return { updated: pendingEventsSnapshot.size };
  }
);

export const createAffiliateActivationFromListing = onDocumentCreated(
  {
    ...affiliateFunctionOptions,
    document: "listings/{listingId}",
  },
  async (event) => {
    const listing = event.data?.data();
    await createAffiliateActivationEvent(listing?.userId, {
      activationReason: "listing_created",
      listingId: event.params.listingId,
    });
  }
);

export const createAffiliateActivationFromMessage = onDocumentCreated(
  {
    ...affiliateFunctionOptions,
    document: "messages/{messageId}",
  },
  async (event) => {
    const message = event.data?.data();
    await createAffiliateActivationEvent(message?.senderId, {
      activationReason: "message_sent",
      conversationId: message?.conversationId || "",
      messageId: event.params.messageId,
    });
  }
);

export const createAffiliateActivationFromSavedActivity = onDocumentUpdated(
  {
    ...affiliateFunctionOptions,
    document: "users/{userId}",
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const beforeSavedListings = Array.isArray(before.savedListings)
      ? before.savedListings.length
      : 0;
    const afterSavedListings = Array.isArray(after.savedListings)
      ? after.savedListings.length
      : 0;
    const beforeCompetitions = Array.isArray(before.attendingCompetitions)
      ? before.attendingCompetitions.length
      : 0;
    const afterCompetitions = Array.isArray(after.attendingCompetitions)
      ? after.attendingCompetitions.length
      : 0;

    if (
      afterSavedListings > beforeSavedListings ||
      afterCompetitions > beforeCompetitions
    ) {
      await createAffiliateActivationEvent(event.params.userId, {
        activationReason:
          afterSavedListings > beforeSavedListings
            ? "saved_listing"
            : "saved_competition",
      });
    }
  }
);

export const createAffiliateFirstTransactionFromSoldListing = onDocumentUpdated(
  {
    ...affiliateFunctionOptions,
    document: "listings/{listingId}",
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    if (before.status === "sold" || after.status !== "sold") return;

    await Promise.all([
      createAffiliateFirstTransactionEvent(after.userId, after, {
        listingId: event.params.listingId,
        transactionRole: "seller",
      }),
      createAffiliateFirstTransactionEvent(after.buyerId, after, {
        listingId: event.params.listingId,
        transactionRole: "buyer",
      }),
    ]);
  }
);

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
