import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { submitListingReview, subscribeToUserReviews } from "../utils/reviews";

function MyPurchases() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [reviewsByListingId, setReviewsByListingId] = useState({});
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState({
    open: false,
    listing: null,
  });
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const openReviewDialog = async (listing) => {
    const existingReview = reviewsByListingId[listing.id];
    setReviewDialog({
      open: true,
      listing,
    });
    setReviewForm({
      rating: existingReview?.rating || 5,
      comment: existingReview?.comment || "",
    });
  };

  const closeReviewDialog = () => {
    if (submittingReview) return;
    setReviewDialog({
      open: false,
      listing: null,
    });
    setReviewForm({
      rating: 5,
      comment: "",
    });
  };

  const handleReviewSubmit = async () => {
    if (!reviewDialog.listing) return;

    setSubmittingReview(true);
    try {
      await submitListingReview({
        listing: reviewDialog.listing,
        reviewer: currentUser,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      closeReviewDialog();
    } catch (error) {
      console.error("Error submitting review:", error);
      alert(error.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
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
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        My Purchases
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Review completed purchases and keep track of what you bought.
      </Typography>

      {purchases.length === 0 ? (
        <Alert severity="info">You do not have any purchases yet.</Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 3,
          }}
        >
          {purchases.map((listing) => {
            const existingReview = reviewsByListingId[listing.id];
            return (
              <Card key={listing.id} sx={{ display: "flex", flexDirection: "column" }}>
                {listing.photos?.[0] ? (
                  <CardMedia
                    component="img"
                    height="200"
                    image={`https://wecube.s3.us-east-1.amazonaws.com/${listing.photos[0].s3Key}`}
                    alt={listing.title}
                    sx={{ objectFit: "contain", backgroundColor: "grey.50" }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 200,
                      backgroundColor: "grey.100",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No Image
                    </Typography>
                  </Box>
                )}

                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, flexGrow: 1 }}>
                  <Box>
                    <Typography variant="h6" gutterBottom noWrap>
                      {listing.title}
                    </Typography>
                    <Typography variant="h5" color="primary" fontWeight="bold">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(listing.price)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
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
                      onClick={() => openReviewDialog(listing)}
                    >
                      {existingReview ? "Edit Review" : "Leave Review"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={reviewDialog.open} onClose={closeReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {reviewsByListingId[reviewDialog.listing?.id] ? "Edit Review" : "Leave Review"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {reviewDialog.listing?.title}
            </Typography>
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Rating
              </Typography>
              <Select
                fullWidth
                value={reviewForm.rating}
                onChange={(event) =>
                  setReviewForm((prev) => ({
                    ...prev,
                    rating: Number(event.target.value),
                  }))
                }
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value} {value === 1 ? "star" : "stars"}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <TextField
              label="Review"
              multiline
              minRows={4}
              value={reviewForm.comment}
              onChange={(event) =>
                setReviewForm((prev) => ({
                  ...prev,
                  comment: event.target.value,
                }))
              }
              placeholder="What was the buying experience like?"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReviewDialog} color="inherit" disabled={submittingReview}>
            Cancel
          </Button>
          <Button
            onClick={handleReviewSubmit}
            variant="contained"
            disabled={submittingReview}
          >
            Save Review
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MyPurchases;
