import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  LISTING_CARD_CONTENT_SX,
  LISTING_CARD_GRID_SX,
  LISTING_CARD_SX,
  LISTING_CARD_TEXT_STACK_SX,
  LISTING_CARD_TITLE_SX,
  ListingCardMediaFrame,
} from "../components/ListingStatusDecorators";
import { subscribeToUserReviews } from "../utils/reviews";
import { getS3PublicUrl } from "../utils/s3";

function MyPurchases() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [reviewsByListingId, setReviewsByListingId] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setPurchases([]);
      setLoading(false);
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
            const aTime = a.soldAt?.toDate ? a.soldAt.toDate().getTime() : new Date(a.soldAt || 0).getTime();
            const bTime = b.soldAt?.toDate ? b.soldAt.toDate().getTime() : new Date(b.soldAt || 0).getTime();
            return bTime - aTime;
          });
        setPurchases(nextPurchases);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to purchases:", error);
        setLoading(false);
      }
    );

    const unsubscribeReviews = subscribeToUserReviews(
      currentUser.uid,
      setReviewsByListingId,
      (error) => {
        console.error("Error subscribing to user reviews:", error);
      }
    );

    return () => {
      unsubscribePurchases();
      unsubscribeReviews();
    };
  }, [currentUser]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  if (!currentUser) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          My Purchases
        </Typography>
        <Alert severity="info">Sign in to view your purchases.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Button onClick={() => navigate("/dashboard")} variant="outlined" sx={{ mb: 3 }}>
        Back to Account
      </Button>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        My Purchases
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Review completed purchases and keep track of what you bought.
      </Typography>

      {purchases.length === 0 ? (
        <Alert severity="info">You do not have any purchases yet.</Alert>
      ) : (
        <Box sx={LISTING_CARD_GRID_SX}>
          {purchases.map((listing) => {
            const existingReview = reviewsByListingId[listing.id];
            return (
              <Card key={listing.id} sx={LISTING_CARD_SX}>
                <ListingCardMediaFrame
                  imageUrl={
                    listing.photos?.[0]
                      ? getS3PublicUrl(listing.photos[0].s3Key)
                      : null
                  }
                  alt={listing.title}
                  isSold={listing.status === "sold"}
                  imageSx={{
                    objectFit: "cover",
                    backgroundColor: "grey.50",
                  }}
                  placeholderSx={{
                    backgroundColor: "grey.100",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />

                <CardContent sx={LISTING_CARD_CONTENT_SX}>
                  <Box sx={LISTING_CARD_TEXT_STACK_SX}>
                    <Typography variant="h6" sx={LISTING_CARD_TITLE_SX}>
                      {listing.title}
                    </Typography>
                    <Typography variant="h5" color="primary" fontWeight="bold" sx={{ lineHeight: 1.1 }}>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(listing.price)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.12 }}>
                      Purchased on {formatDate(listing.soldAt)}
                    </Typography>
                  </Box>

                  {existingReview ? (
                    <Alert severity="success">
                      Reviewed: {Number(existingReview.rating).toFixed(1)} stars
                    </Alert>
                  ) : (
                    <Alert severity="info">You have not reviewed this seller yet.</Alert>
                  )}

                  <Stack direction="row" spacing={1} sx={{ mt: "auto" }}>
                    <Button
                      variant="outlined"
                      onClick={() => navigate(`/listing/${listing.id}`)}
                    >
                      View Listing
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => navigate("/my-reviews")}
                    >
                      {existingReview ? "Manage Review" : "Review in My Reviews"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default MyPurchases;
