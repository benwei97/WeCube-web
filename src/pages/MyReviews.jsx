import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Star } from "@mui/icons-material";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  submitTransactionReview,
  subscribeToReceivedReviews,
  subscribeToUserReviews,
} from "../utils/reviews";

function MyReviews() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending");
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [writtenReviewsByListingId, setWrittenReviewsByListingId] = useState({});
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [userNamesById, setUserNamesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState({
    open: false,
    task: null,
  });
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setPurchases([]);
      setSales([]);
      setWrittenReviewsByListingId({});
      setReceivedReviews([]);
      setLoading(false);
      return undefined;
    }

    const purchasesQuery = query(
      collection(db, "listings"),
      where("buyerId", "==", currentUser.uid)
    );
    const salesQuery = query(
      collection(db, "listings"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribePurchases = onSnapshot(
      purchasesQuery,
      (snapshot) => {
        const nextPurchases = snapshot.docs
          .map((listingDoc) => ({
            id: listingDoc.id,
            ...listingDoc.data(),
          }))
          .filter((listing) => listing.status === "sold")
          .sort((a, b) => {
            const aTime = a.soldAt?.toDate ? a.soldAt.toDate().getTime() : new Date(a.soldAt || 0).getTime();
            const bTime = b.soldAt?.toDate ? b.soldAt.toDate().getTime() : new Date(b.soldAt || 0).getTime();
            return bTime - aTime;
          });
        setPurchases(nextPurchases);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to purchases for reviews:", error);
        setLoading(false);
      }
    );

    const unsubscribeSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const nextSales = snapshot.docs
          .map((listingDoc) => ({
            id: listingDoc.id,
            ...listingDoc.data(),
          }))
          .filter((listing) => listing.status === "sold" && Boolean(listing.buyerId))
          .sort((a, b) => {
            const aTime = a.soldAt?.toDate ? a.soldAt.toDate().getTime() : new Date(a.soldAt || 0).getTime();
            const bTime = b.soldAt?.toDate ? b.soldAt.toDate().getTime() : new Date(b.soldAt || 0).getTime();
            return bTime - aTime;
          });
        setSales(nextSales);
      },
      (error) => {
        console.error("Error subscribing to sales for reviews:", error);
      }
    );

    const unsubscribeWrittenReviews = subscribeToUserReviews(
      currentUser.uid,
      setWrittenReviewsByListingId,
      (error) => {
        console.error("Error subscribing to written reviews:", error);
      }
    );

    const unsubscribeReceivedReviews = subscribeToReceivedReviews(
      currentUser.uid,
      setReceivedReviews,
      (error) => {
        console.error("Error subscribing to received reviews:", error);
      }
    );

    return () => {
      unsubscribePurchases();
      unsubscribeSales();
      unsubscribeWrittenReviews();
      unsubscribeReceivedReviews();
    };
  }, [currentUser]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  const pendingReviewTasks = useMemo(() => {
    const pendingPurchases = purchases
      .filter((listing) => !writtenReviewsByListingId[listing.id])
      .map((listing) => ({
        id: `buyer-${listing.id}`,
        type: "buyer_to_seller",
        listing,
        recipientId: listing.userId,
        recipientRole: "seller",
        title: "Review Seller",
        subtitle: "You bought this item",
      }));

    const pendingSales = sales
      .filter((listing) => !writtenReviewsByListingId[listing.id])
      .map((listing) => ({
        id: `seller-${listing.id}`,
        type: "seller_to_buyer",
        listing,
        recipientId: listing.buyerId,
        recipientRole: "buyer",
        title: "Review Buyer",
        subtitle: "You sold this item",
      }));

    return [...pendingPurchases, ...pendingSales].sort((a, b) => {
      const aTime = a.listing.soldAt?.toDate ? a.listing.soldAt.toDate().getTime() : new Date(a.listing.soldAt || 0).getTime();
      const bTime = b.listing.soldAt?.toDate ? b.listing.soldAt.toDate().getTime() : new Date(b.listing.soldAt || 0).getTime();
      return bTime - aTime;
    });
  }, [purchases, sales, writtenReviewsByListingId]);

  const writtenReviews = useMemo(
    () =>
      Object.values(writtenReviewsByListingId).sort((a, b) => {
        const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || 0).getTime();
        const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      }),
    [writtenReviewsByListingId]
  );

  const receivedReviewSummary = useMemo(() => {
    const reviewCount = receivedReviews.length;
    const averageRating =
      reviewCount > 0
        ? receivedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviewCount
        : null;
    return { reviewCount, averageRating };
  }, [receivedReviews]);

  useEffect(() => {
    const userIds = new Set();
    pendingReviewTasks.forEach((task) => {
      if (task.recipientId) {
        userIds.add(task.recipientId);
      }
    });
    writtenReviews.forEach((review) => {
      if (review.recipientId) {
        userIds.add(review.recipientId);
      }
    });

    const missingUserIds = [...userIds].filter((userId) => !userNamesById[userId]);
    if (missingUserIds.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all(
      missingUserIds.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (!userDoc.exists()) {
            return [userId, "User"];
          }
          const userData = userDoc.data();
          return [
            userId,
            `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
              userData.email ||
              "User",
          ];
        } catch (error) {
          console.error("Error fetching user name for reviews:", error);
          return [userId, "User"];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setUserNamesById((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [pendingReviewTasks, writtenReviews, userNamesById]);

  const openReviewDialog = (task) => {
    const existingReview = writtenReviewsByListingId[task.listing.id];
    setReviewDialog({
      open: true,
      task,
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
      task: null,
    });
    setReviewForm({
      rating: 5,
      comment: "",
    });
  };

  const handleReviewSubmit = async () => {
    if (!reviewDialog.task) return;

    setSubmittingReview(true);
    try {
      await submitTransactionReview({
        listing: reviewDialog.task.listing,
        reviewer: currentUser,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        recipientId: reviewDialog.task.recipientId,
        recipientName:
          userNamesById[reviewDialog.task.recipientId] ||
          reviewDialog.task.listing.recipientName ||
          "User",
        recipientRole: reviewDialog.task.recipientRole,
      });
      closeReviewDialog();
    } catch (error) {
      console.error("Error submitting review:", error);
      alert(error.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderTaskCard = (task) => {
    const recipientName = userNamesById[task.recipientId] || "User";

    return (
      <Card key={task.id} variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h6">{task.listing.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {task.subtitle} • {formatDate(task.listing.soldAt)}
              </Typography>
            </Box>
            <Typography variant="body1">
              {task.title} for {recipientName}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={() => openReviewDialog(task)}>
                {task.title}
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate(`/listing/${task.listing.id}`)}
              >
                View Listing
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  if (!currentUser) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          My Reviews
        </Typography>
        <Alert severity="info">Sign in to manage your reviews.</Alert>
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
        My Reviews
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Complete pending reviews, edit feedback you have written, and see how others have rated you.
      </Typography>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label={`To Review (${pendingReviewTasks.length})`} value="pending" />
        <Tab label={`Written By Me (${writtenReviews.length})`} value="written" />
        <Tab label={`About Me (${receivedReviewSummary.reviewCount})`} value="about" />
      </Tabs>

      {tab === "pending" && (
        pendingReviewTasks.length === 0 ? (
          <Alert severity="success">You do not have any reviews left to write.</Alert>
        ) : (
          <Stack spacing={2}>
            {pendingReviewTasks.map(renderTaskCard)}
          </Stack>
        )
      )}

      {tab === "written" && (
        writtenReviews.length === 0 ? (
          <Alert severity="info">You have not written any reviews yet.</Alert>
        ) : (
          <Stack spacing={2}>
            {writtenReviews.map((review) => (
              <Card key={review.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="h6">{review.listingTitle || "Transaction"}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        For {userNamesById[review.recipientId] || review.recipientName || "User"} • {formatDate(review.updatedAt || review.createdAt)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Star fontSize="inherit" />
                      {Number(review.rating || 0).toFixed(1)}
                    </Typography>
                    {review.comment && <Typography variant="body1">{review.comment}</Typography>}
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        onClick={() =>
                          openReviewDialog({
                            id: `${review.reviewerRole}-${review.listingId}`,
                            type: review.reviewerRole === "buyer" ? "buyer_to_seller" : "seller_to_buyer",
                            listing:
                              purchases.find((listing) => listing.id === review.listingId) ||
                              sales.find((listing) => listing.id === review.listingId) || {
                                id: review.listingId,
                                title: review.listingTitle,
                                userId: review.sellerId,
                                buyerId: review.buyerId,
                              },
                            recipientId: review.recipientId,
                            recipientRole: review.recipientRole,
                            title: review.recipientRole === "seller" ? "Review Seller" : "Review Buyer",
                            subtitle: review.reviewerRole === "buyer" ? "You bought this item" : "You sold this item",
                          })
                        }
                      >
                        Edit Review
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => navigate(`/listing/${review.listingId}`)}
                      >
                        View Listing
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )
      )}

      {tab === "about" && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Your Review Summary
            </Typography>
            {receivedReviewSummary.reviewCount > 0 ? (
              <>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <Star fontSize="inherit" />
                  {receivedReviewSummary.averageRating?.toFixed(1) || "0.0"} ·{" "}
                  {receivedReviewSummary.reviewCount} review
                  {receivedReviewSummary.reviewCount === 1 ? "" : "s"}
                </Typography>
                <Button
                  sx={{ mt: 2 }}
                  variant="outlined"
                  onClick={() => navigate(`/user/${currentUser.uid}`)}
                >
                  View My Profile
                </Button>
              </>
            ) : (
              <>
                <Alert severity="info">No one has reviewed you yet.</Alert>
                <Button
                  sx={{ mt: 2 }}
                  variant="outlined"
                  onClick={() => navigate(`/user/${currentUser.uid}`)}
                >
                  View My Profile
                </Button>
              </>
            )}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Recent Reviews About You
            </Typography>
            {receivedReviews.length === 0 ? (
              <Alert severity="info">No reviews yet.</Alert>
            ) : (
              <Stack spacing={2}>
                {receivedReviews.map((review) => (
                  <Card key={review.id} variant="outlined">
                    <CardContent>
                      <Typography variant="body1" fontWeight={600}>
                        {review.reviewerName || "User"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
                      >
                        <Star fontSize="inherit" />
                        {Number(review.rating || 0).toFixed(1)}
                        {review.listingTitle ? ` • ${review.listingTitle}` : ""}
                      </Typography>
                      {review.comment && <Typography variant="body1">{review.comment}</Typography>}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      <Dialog open={reviewDialog.open} onClose={closeReviewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {writtenReviewsByListingId[reviewDialog.task?.listing?.id] ? "Edit Review" : "Leave Review"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {reviewDialog.task?.listing?.title}
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
              placeholder="Share how the transaction went."
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

export default MyReviews;
