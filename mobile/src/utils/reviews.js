import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export function getReviewDocId(reviewerId, recipientId) {
  return `${reviewerId}_${recipientId}`;
}

export async function getExistingReview(reviewerId, recipientId) {
  const pairReviewDoc = await getDoc(doc(db, "reviews", getReviewDocId(reviewerId, recipientId)));
  if (pairReviewDoc.exists()) {
    return { id: pairReviewDoc.id, ...pairReviewDoc.data() };
  }

  const legacyReviewsQuery = query(
    collection(db, "reviews"),
    where("reviewerId", "==", reviewerId),
    where("recipientId", "==", recipientId)
  );
  const legacyReviewsSnapshot = await getDocs(legacyReviewsQuery);
  const legacyReviewDoc = legacyReviewsSnapshot.docs[0];
  return legacyReviewDoc
    ? { id: legacyReviewDoc.id, ...legacyReviewDoc.data() }
    : null;
}

export async function submitTransactionReview({
  listing,
  reviewer,
  rating,
  comment,
  recipientId,
  recipientName,
  recipientRole,
  saleEventId,
}) {
  if (!listing?.id || !reviewer?.uid) {
    throw new Error("Missing review context");
  }

  const isBuyerReviewer = listing.buyerId === reviewer.uid;
  const isSellerReviewer = listing.userId === reviewer.uid;

  if (!isBuyerReviewer && !isSellerReviewer) {
    throw new Error("Only the buyer or seller can review this transaction");
  }

  const normalizedRating = Number(rating);
  if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  let resolvedRecipientId = recipientId;
  let resolvedRecipientRole = recipientRole;

  if (isBuyerReviewer) {
    resolvedRecipientId = listing.userId;
    resolvedRecipientRole = "seller";
  } else if (isSellerReviewer) {
    if (!listing.buyerId) {
      throw new Error("This sale is not attributed to a buyer yet");
    }

    resolvedRecipientId = listing.buyerId;
    resolvedRecipientRole = "buyer";
  }

  if (!resolvedRecipientId || resolvedRecipientId === reviewer.uid) {
    throw new Error("Invalid review recipient");
  }

  const reviewRef = doc(db, "reviews", getReviewDocId(reviewer.uid, resolvedRecipientId));
  const existingReview = await getExistingReview(reviewer.uid, resolvedRecipientId);
  if (existingReview) {
    throw new Error("You have already reviewed this user");
  }

  const now = new Date();
  const resolvedSaleEventId = listing.saleEventId || saleEventId || null;
  const listingPhotoS3Key = listing.photos?.[0]?.s3Key || "";
  const reviewerName =
    `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() ||
    (isBuyerReviewer ? "Buyer" : "Seller");

  await setDoc(
    reviewRef,
    {
      listingId: listing.id,
      listingTitle: listing.title,
      listingPhotoS3Key,
      saleEventId: resolvedSaleEventId,
      sellerId: listing.userId,
      buyerId: listing.buyerId || null,
      reviewerId: reviewer.uid,
      reviewerName,
      reviewerRole: isBuyerReviewer ? "buyer" : "seller",
      recipientId: resolvedRecipientId,
      recipientName: recipientName || "",
      recipientRole: resolvedRecipientRole,
      rating: normalizedRating,
      comment: comment.trim(),
      createdAt: now,
      updatedAt: now,
    },
    { merge: false }
  );
}
