import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Star } from "@mui/icons-material";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToReceivedReviews } from "../utils/reviews";

function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [listings, setListings] = useState([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setReceivedReviews([]);
      setListings([]);
      setPurchaseCount(0);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const listingsQuery = query(
      collection(db, "listings"),
      where("userId", "==", currentUser.uid)
    );
    const purchasesQuery = query(
      collection(db, "listings"),
      where("buyerId", "==", currentUser.uid)
    );

    const unsubscribeListings = onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs.map((listingDoc) => ({
          id: listingDoc.id,
          ...listingDoc.data(),
        }));
        setListings(nextListings);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to dashboard listings:", error);
        setLoading(false);
      }
    );

    const unsubscribeReviews = subscribeToReceivedReviews(
      currentUser.uid,
      setReceivedReviews,
      (error) => {
        console.error("Error subscribing to dashboard reviews:", error);
      }
    );

    let cancelled = false;
    getDocs(purchasesQuery)
      .then((snapshot) => {
        if (!cancelled) {
          setPurchaseCount(snapshot.size);
        }
      })
      .catch((error) => {
        console.error("Error loading purchase count:", error);
      });

    return () => {
      cancelled = true;
      unsubscribeListings();
      unsubscribeReviews();
    };
  }, [currentUser]);

  const userName =
    `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim() || "Your Account";

  const reviewSummary = useMemo(() => {
    const reviewCount = receivedReviews.length;
    const averageRating =
      reviewCount > 0
        ? receivedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviewCount
        : null;
    return { reviewCount, averageRating };
  }, [receivedReviews]);

  const sellingSummary = useMemo(() => {
    const activeListings = listings.filter(
      (listing) => listing.status !== "sold" && listing.status !== "archived"
    ).length;
    const soldListings = listings.filter((listing) => listing.status === "sold").length;
    const archivedListings = listings.filter((listing) => listing.status === "archived").length;
    return {
      totalListings: listings.length,
      activeListings,
      soldListings,
      archivedListings,
    };
  }, [listings]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  const recentReviews = receivedReviews.slice(0, 3);

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
        Account
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Your profile, feedback, and the quickest way back into marketplace activity.
      </Typography>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            About
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Avatar src={currentUser?.avatarUrl || undefined} sx={{ width: 72, height: 72 }}>
              {userName.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h4" fontWeight="bold">
                {userName}
              </Typography>
              {currentUser?.email && (
                <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                  {currentUser.email}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Member since {formatDate(currentUser?.createdAt)}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Feedback
              </Typography>
              {reviewSummary.reviewCount > 0 ? (
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}
                >
                  <Star fontSize="inherit" />
                  {reviewSummary.averageRating?.toFixed(1) || "0.0"} ·{" "}
                  {reviewSummary.reviewCount} review
                  {reviewSummary.reviewCount === 1 ? "" : "s"}
                </Typography>
              ) : (
                <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                  No reviews yet
                </Typography>
              )}
            </Box>
            <Button variant="outlined" onClick={() => navigate(`/user/${currentUser.uid}`)}>
              View Public Profile
            </Button>
          </Box>

          {recentReviews.length === 0 ? (
            <Alert severity="info">You have not received any reviews yet.</Alert>
          ) : (
            <Stack spacing={2}>
              {recentReviews.map((review) => (
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

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Quick Access
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 2,
            }}
          >
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  My Listings
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Manage active, sold, and archived listings.
                </Typography>
                <Button variant="contained" onClick={() => navigate("/my-listings")}>
                  Open My Listings
                </Button>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  My Purchases
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  View items you bought and revisit completed transactions.
                </Typography>
                <Button variant="contained" onClick={() => navigate("/my-purchases")}>
                  Open My Purchases
                </Button>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  My Reviews
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Finish pending reviews and manage feedback you have written.
                </Typography>
                <Button variant="contained" onClick={() => navigate("/my-reviews")}>
                  Open My Reviews
                </Button>
              </CardContent>
            </Card>
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Selling History
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A lightweight summary of your marketplace activity. More detailed management still lives in My Listings.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label={`${sellingSummary.totalListings} total listing${sellingSummary.totalListings === 1 ? "" : "s"}`} />
            <Chip label={`${sellingSummary.activeListings} active`} />
            <Chip label={`${sellingSummary.soldListings} sold`} />
            <Chip label={`${sellingSummary.archivedListings} archived`} />
            <Chip label={`${purchaseCount} purchase${purchaseCount === 1 ? "" : "s"}`} />
          </Stack>
          <Button variant="text" onClick={() => navigate("/my-listings")}>
            Go to My Listings
          </Button>
        </Paper>
      </Stack>
    </Box>
  );
}

export default Dashboard;
