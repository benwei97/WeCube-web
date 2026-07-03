import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export function getReviewDocId(listingId, reviewerId, saleEventId = null) {
  return saleEventId
    ? `${listingId}_${saleEventId}_${reviewerId}`
    : `${listingId}_${reviewerId}`;
}

export async function getExistingReview(listingId, reviewerId, saleEventId = null) {
  const reviewDoc = await getDoc(doc(db, "reviews", getReviewDocId(listingId, reviewerId, saleEventId)));
  return reviewDoc.exists() ? { id: reviewDoc.id, ...reviewDoc.data() } : null;
}

export async function deleteTransactionReviews(listingId) {
  if (!listingId) return;

  const reviewsQuery = query(
    collection(db, "reviews"),
    where("listingId", "==", listingId)
  );
  const snapshot = await getDocs(reviewsQuery);

  await Promise.all(
    snapshot.docs.map((reviewDoc) => deleteDoc(reviewDoc.ref))
  );
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

  const reviewId = getReviewDocId(listing.id, reviewer.uid, listing.saleEventId || saleEventId);
  const reviewRef = doc(db, "reviews", reviewId);
  const existingReview = await getDoc(reviewRef);
  const now = new Date();
  const resolvedSaleEventId = listing.saleEventId || saleEventId || null;
  const listingPhotoS3Key = listing.photos?.[0]?.s3Key || "";

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

export async function submitConversationReview({
  listing,
  conversation,
  reviewer,
  rating,
  comment,
  recipientId,
  recipientName,
  recipientRole,
  saleEventId,
}) {
  if (!listing?.id || !conversation?.id || !reviewer?.uid || !recipientId) {
    throw new Error("Missing review context");
  }

  if (
    reviewer.uid !== conversation.buyerId &&
    reviewer.uid !== conversation.sellerId
  ) {
    throw new Error("Only conversation participants can review this experience");
  }

  if (recipientId === reviewer.uid) {
    throw new Error("Invalid review recipient");
  }

  const normalizedRating = Number(rating);
  if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const reviewerRole =
    reviewer.uid === conversation.buyerId ? "buyer" : "seller";
  const reviewId = `${conversation.id}_${reviewer.uid}`;
  const reviewRef = doc(db, "reviews", reviewId);
  const existingReview = await getDoc(reviewRef);
  const now = new Date();
  const listingPhotoS3Key = listing.photos?.[0]?.s3Key || "";

  await setDoc(
    reviewRef,
    {
      listingId: listing.id,
      listingTitle: listing.title,
      listingPhotoS3Key,
      conversationId: conversation.id,
      saleEventId: saleEventId || null,
      sellerId: conversation.sellerId,
      buyerId: conversation.buyerId,
      reviewerId: reviewer.uid,
      reviewerName:
        `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() ||
        (reviewerRole === "buyer" ? "Buyer" : "Seller"),
      reviewerRole,
      recipientId,
      recipientName: recipientName || "",
      recipientRole,
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
      const reviewsByTransactionId = snapshot.docs.reduce((acc, reviewDoc) => {
        const review = {
          id: reviewDoc.id,
          ...reviewDoc.data(),
        };
        acc[review.listingId] = review;
        if (review.saleEventId) {
          acc[`${review.listingId}:${review.saleEventId}`] = review;
        }
        return acc;
      }, {});
      callback(reviewsByTransactionId);
    },
    onError
  );
}

export function subscribeToPendingReviewCount(userId, callback, onError) {
  const authoredReviewsQuery = query(
    collection(db, "reviews"),
    where("reviewerId", "==", userId)
  );
  const purchasesQuery = query(
    collection(db, "listings"),
    where("buyerId", "==", userId)
  );
  const salesQuery = query(
    collection(db, "listings"),
    where("userId", "==", userId)
  );

  let authoredReviews = [];
  let purchases = [];
  let sales = [];

  const emitCount = () => {
    const reviewedTransactionIds = new Set(
      authoredReviews.map((review) =>
        review.saleEventId ? `${review.listingId}:${review.saleEventId}` : review.listingId
      )
    );
    const getTransactionId = (listing) =>
      listing.saleEventId ? `${listing.id}:${listing.saleEventId}` : listing.id;
    const pendingPurchaseReviews = purchases.filter(
      (listing) => listing.status === "sold" && !reviewedTransactionIds.has(getTransactionId(listing))
    ).length;
    const pendingSellerReviews = sales.filter(
      (listing) =>
        listing.status === "sold" &&
        Boolean(listing.buyerId) &&
        !reviewedTransactionIds.has(getTransactionId(listing))
    ).length;

    callback(pendingPurchaseReviews + pendingSellerReviews);
  };

  const handleError = (error) => {
    if (onError) {
      onError(error);
    } else {
      console.error("Error subscribing to pending review count:", error);
    }
  };

  const unsubscribeReviews = onSnapshot(
    authoredReviewsQuery,
    (snapshot) => {
      authoredReviews = snapshot.docs.map((reviewDoc) => reviewDoc.data());
      emitCount();
    },
    handleError
  );

  const unsubscribePurchases = onSnapshot(
    purchasesQuery,
    (snapshot) => {
      purchases = snapshot.docs.map((listingDoc) => ({
        id: listingDoc.id,
        ...listingDoc.data(),
      }));
      emitCount();
    },
    handleError
  );

  const unsubscribeSales = onSnapshot(
    salesQuery,
    (snapshot) => {
      sales = snapshot.docs.map((listingDoc) => ({
        id: listingDoc.id,
        ...listingDoc.data(),
      }));
      emitCount();
    },
    handleError
  );

  return () => {
    unsubscribeReviews();
    unsubscribePurchases();
    unsubscribeSales();
  };
}
