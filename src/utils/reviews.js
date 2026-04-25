import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export function getReviewDocId(listingId, reviewerId) {
  return `${listingId}_${reviewerId}`;
}

export async function getExistingReview(listingId, reviewerId) {
  const reviewDoc = await getDoc(doc(db, "reviews", getReviewDocId(listingId, reviewerId)));
  return reviewDoc.exists() ? { id: reviewDoc.id, ...reviewDoc.data() } : null;
}

export async function submitTransactionReview({
  listing,
  reviewer,
  rating,
  comment,
  recipientId,
  recipientName,
  recipientRole,
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

  const reviewId = getReviewDocId(listing.id, reviewer.uid);
  const reviewRef = doc(db, "reviews", reviewId);
  const existingReview = await getDoc(reviewRef);
  const now = new Date();

  await setDoc(
    reviewRef,
    {
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.userId,
      buyerId: listing.buyerId || null,
      reviewerId: reviewer.uid,
      reviewerName:
        `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() ||
        (isBuyerReviewer ? "Buyer" : "Seller"),
      reviewerRole: isBuyerReviewer ? "buyer" : "seller",
      recipientId: resolvedRecipientId,
      recipientName: recipientName || "",
      recipientRole: resolvedRecipientRole,
      rating: normalizedRating,
      comment: comment.trim(),
      createdAt: existingReview.exists() ? existingReview.data().createdAt : now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function getUserReviewSummary(userId) {
  const reviews = await new Promise((resolve, reject) => {
    const unsubscribe = subscribeToReceivedReviews(
      userId,
      (nextReviews) => {
        unsubscribe();
        resolve(nextReviews);
      },
      reject
    );
  });

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
        reviewCount
      : null;

  return { reviewCount, averageRating };
}

export function subscribeToReceivedReviews(userId, callback, onError) {
  const reviewsQuery = query(
    collection(db, "reviews"),
    where("recipientId", "==", userId)
  );

  return onSnapshot(
    reviewsQuery,
    (snapshot) => {
      const reviews = snapshot.docs
        .map((reviewDoc) => ({
          id: reviewDoc.id,
          ...reviewDoc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || 0).getTime();
          const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || 0).getTime();
          return bTime - aTime;
        });
      callback(reviews);
    },
    onError
  );
}

export function subscribeToSellerReviews(sellerId, callback, onError) {
  return subscribeToReceivedReviews(sellerId, callback, onError);
}

export function subscribeToUserReviews(reviewerId, callback, onError) {
  const reviewsQuery = query(
    collection(db, "reviews"),
    where("reviewerId", "==", reviewerId)
  );

  return onSnapshot(
    reviewsQuery,
    (snapshot) => {
      const reviewsByListingId = snapshot.docs.reduce((acc, reviewDoc) => {
        const review = {
          id: reviewDoc.id,
          ...reviewDoc.data(),
        };
        acc[review.listingId] = review;
        return acc;
      }, {});
      callback(reviewsByListingId);
    },
    onError
  );
}
