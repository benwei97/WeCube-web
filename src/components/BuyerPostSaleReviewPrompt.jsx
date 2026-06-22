import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToUserReviews } from "../utils/reviews";
import PostSaleReviewPrompt from "./PostSaleReviewPrompt";

function getSaleInstanceId(listing = {}) {
  const soldAt = listing.soldAt;
  if (!soldAt) return "unsold";
  if (typeof soldAt?.toMillis === "function") return soldAt.toMillis();
  if (typeof soldAt?.toDate === "function") return soldAt.toDate().getTime();

  const soldAtDate = new Date(soldAt);
  return Number.isNaN(soldAtDate.getTime()) ? "unknown" : soldAtDate.getTime();
}

function getPromptStorageKey(userId, listing) {
  return `wecube_post_sale_review_prompt_${userId}_${listing.id}_${getSaleInstanceId(listing)}`;
}

function BuyerPostSaleReviewPrompt() {
  const { currentUser } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [reviewsByListingId, setReviewsByListingId] = useState({});
  const [sellerProfilesById, setSellerProfilesById] = useState({});
  const [dismissedPromptIds, setDismissedPromptIds] = useState(() => new Set());
  const [visiblePromptListingId, setVisiblePromptListingId] = useState(null);
  const promptTimerRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.uid) {
      setPurchases([]);
      setReviewsByListingId({});
      setSellerProfilesById({});
      setDismissedPromptIds(new Set());
      setVisiblePromptListingId(null);
      return undefined;
    }

    const purchasesQuery = query(
      collection(db, "listings"),
      where("buyerId", "==", currentUser.uid)
    );

    const unsubscribePurchases = onSnapshot(
      purchasesQuery,
      (snapshot) => {
        const nextPurchases = snapshot.docs
          .map((listingDoc) => ({
            id: listingDoc.id,
            ...listingDoc.data(),
          }))
          .sort((a, b) => {
            const aTime = a.soldAt?.toDate
              ? a.soldAt.toDate().getTime()
              : new Date(a.soldAt || 0).getTime();
            const bTime = b.soldAt?.toDate
              ? b.soldAt.toDate().getTime()
              : new Date(b.soldAt || 0).getTime();
            return bTime - aTime;
          });
        setPurchases(nextPurchases);
      },
      (error) => {
        console.error("Error subscribing to buyer post-sale purchases:", error);
      }
    );

    const unsubscribeReviews = subscribeToUserReviews(
      currentUser.uid,
      setReviewsByListingId,
      (error) => {
        console.error("Error subscribing to buyer post-sale reviews:", error);
      }
    );

    return () => {
      unsubscribePurchases();
      unsubscribeReviews();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) {
      return;
    }

    const dismissedIds = purchases
      .filter((listing) =>
        window.localStorage.getItem(getPromptStorageKey(currentUser.uid, listing))
      )
      .map((listing) => listing.id);
    setDismissedPromptIds(new Set(dismissedIds));
  }, [currentUser?.uid, purchases]);

  useEffect(() => {
    const missingSellerIds = [
      ...new Set(
        purchases
          .map((listing) => listing.userId)
          .filter((sellerId) => sellerId && !sellerProfilesById[sellerId])
      ),
    ];

    if (missingSellerIds.length === 0) {
      return undefined;
    }

    let cancelled = false;
    Promise.all(
      missingSellerIds.map(async (sellerId) => {
        try {
          const sellerDoc = await getDoc(doc(db, "users", sellerId));
          if (!sellerDoc.exists()) {
            return [sellerId, { name: "Seller", avatarUrl: "" }];
          }

          const sellerData = sellerDoc.data();
          return [
            sellerId,
            {
              name:
                `${sellerData.firstName || ""} ${sellerData.lastName || ""}`.trim() ||
                sellerData.email ||
                "Seller",
              avatarUrl: sellerData.avatarUrl || sellerData.photoURL || "",
            },
          ];
        } catch (error) {
          console.error("Error loading seller profile for buyer review prompt:", error);
          return [sellerId, { name: "Seller", avatarUrl: "" }];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setSellerProfilesById((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [purchases, sellerProfilesById]);

  const pendingReviewPromptListing = useMemo(
    () =>
      purchases.find(
        (listing) =>
          listing.status === "sold" &&
          !reviewsByListingId[listing.id] &&
          !dismissedPromptIds.has(listing.id)
      ) || null,
    [dismissedPromptIds, purchases, reviewsByListingId]
  );

  useEffect(() => {
    if (promptTimerRef.current) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    if (!pendingReviewPromptListing) {
      setVisiblePromptListingId(null);
      return undefined;
    }

    promptTimerRef.current = window.setTimeout(() => {
      setVisiblePromptListingId(pendingReviewPromptListing.id);
      promptTimerRef.current = null;
    }, 700);

    return () => {
      if (promptTimerRef.current) {
        window.clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
    };
  }, [pendingReviewPromptListing]);

  const dismissReviewPrompt = () => {
    if (!pendingReviewPromptListing || !currentUser?.uid) return;

    window.localStorage.setItem(
      getPromptStorageKey(currentUser.uid, pendingReviewPromptListing),
      "dismissed"
    );
    setDismissedPromptIds(
      (prev) => new Set([...prev, pendingReviewPromptListing.id])
    );
    setVisiblePromptListingId(null);
  };

  if (!currentUser || !pendingReviewPromptListing) {
    return null;
  }

  const sellerProfile = sellerProfilesById[pendingReviewPromptListing.userId];

  return (
    <PostSaleReviewPrompt
      open={visiblePromptListingId === pendingReviewPromptListing.id}
      onClose={dismissReviewPrompt}
      listing={pendingReviewPromptListing}
      reviewer={currentUser}
      recipientId={pendingReviewPromptListing.userId}
      recipientName={sellerProfile?.name || "Seller"}
      recipientAvatarUrl={sellerProfile?.avatarUrl || ""}
      recipientRole="seller"
      title="Congratulations on your new puzzle!"
      subtitle="Leave a quick review for the seller now, or handle it later from My Reviews."
    />
  );
}

export default BuyerPostSaleReviewPrompt;
