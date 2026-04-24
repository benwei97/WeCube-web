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

export async function submitListingReview({
  listing,
  reviewer,
  rating,
  comment,
}) {
  if (!listing?.id || !reviewer?.uid) {
    throw new Error("Missing review context");
  }

  if (listing.buyerId !== reviewer.uid) {
    throw new Error("Only the buyer can review this purchase");
  }

  if (listing.userId === reviewer.uid) {
    throw new Error("You cannot review your own listing");
  }

  const normalizedRating = Number(rating);
  if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error("Rating must be between 1 and 5");
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
      reviewerId: reviewer.uid,
      reviewerName:
        `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() || "Buyer",
      rating: normalizedRating,
      comment: comment.trim(),
      createdAt: existingReview.exists() ? existingReview.data().createdAt : now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export function subscribeToSellerReviews(sellerId, callback, onError) {
  const reviewsQuery = query(
    collection(db, "reviews"),
    where("sellerId", "==", sellerId)
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
