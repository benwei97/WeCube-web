import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowBack, Star } from "@mui/icons-material";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { getPrimaryFulfillmentOption } from "../utils/listingUtils";
import { subscribeToSellerReviews } from "../utils/reviews";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";
import { getS3PublicUrl } from "../utils/s3";

function SellerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [sellerListings, setSellerListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllActiveListings, setShowAllActiveListings] = useState(false);

  useEffect(() => {
    setLoading(true);

    const unsubscribeUser = onSnapshot(
      doc(db, "users", userId),
      (userDoc) => {
        setSeller(userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to seller profile:", error);
        setLoading(false);
      }
    );

    const unsubscribeListings = onSnapshot(
      query(collection(db, "listings"), where("userId", "==", userId)),
      (snapshot) => {
        const listings = snapshot.docs.map((listingDoc) => ({
          id: listingDoc.id,
          ...listingDoc.data(),
        }));
        listings.sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
        setSellerListings(listings);
      }
    );

    const unsubscribeReviews = subscribeToSellerReviews(userId, setReviews);

    return () => {
      unsubscribeUser();
      unsubscribeListings();
      unsubscribeReviews();
    };
  }, [userId]);

  const sellerName =
    `${seller?.firstName || ""} ${seller?.lastName || ""}`.trim() || "Seller";

  const activeListings = useMemo(
    () =>
      sellerListings.filter(
        (listing) => listing.status !== "sold" && listing.status !== "archived"
      ),
    [sellerListings]
  );
  const visibleActiveListings = showAllActiveListings
    ? activeListings
    : activeListings.slice(0, 6);
  const soldListings = useMemo(
    () => sellerListings.filter((listing) => listing.status === "sold"),
    [sellerListings]
  );
  const reviewSummary = useMemo(() => {
    const reviewCount = reviews.length;
    const averageRating =
      reviewCount > 0
        ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviewCount
        : null;
    return { reviewCount, averageRating };
  }, [reviews]);

  const formatDate = (dateValue) => {
    if (!dateValue) return null;
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  if (!seller) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Profile not found</Typography>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }} variant="outlined">
          Back
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Button
        onClick={() => navigate(-1)}
        variant="outlined"
        startIcon={<ArrowBack />}
        sx={{ mb: 3 }}
      >
        Back
      </Button>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
          <Avatar src={seller.avatarUrl || undefined} sx={{ width: 72, height: 72 }}>
            {sellerName.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {sellerName}
            </Typography>
            {reviewSummary.reviewCount > 0 ? (
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}
              >
                <Star fontSize="inherit" />
                {reviewSummary.averageRating
                  ? reviewSummary.averageRating.toFixed(1)
                  : "0.0"}{" "}
                · {reviewSummary.reviewCount} review
                {reviewSummary.reviewCount === 1 ? "" : "s"}
              </Typography>
            ) : (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                No reviews yet
              </Typography>
            )}
            {seller.createdAt && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Member since {formatDate(seller.createdAt)}
              </Typography>
            )}
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
          <Chip label={`${activeListings.length} active listing${activeListings.length === 1 ? "" : "s"}`} />
          <Chip label={`${soldListings.length} completed sale${soldListings.length === 1 ? "" : "s"}`} />
          <Chip label={`${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? "" : "s"}`} />
        </Stack>
      </Paper>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Active Listings
          </Typography>
          {activeListings.length === 0 ? (
            <Alert severity="info">This user does not have any active listings right now.</Alert>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(3, minmax(0, 1fr))",
                },
                gap: 1.5,
              }}
            >
              {visibleActiveListings.map((listing) => {
                const fulfillmentOption = getPrimaryFulfillmentOption(listing);
                const thumbnailUrl = listing.photos?.[0]?.s3Key
                  ? getS3PublicUrl(listing.photos[0].s3Key)
                  : null;
                return (
                  <Card key={listing.id} variant="outlined">
                    <CardContent
                      sx={{
                        p: 1.5,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.25,
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1.25}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                      >
                        <Box
                          sx={{
                            width: 64,
                            height: 64,
                            borderRadius: 1,
                            overflow: "hidden",
                            bgcolor: "grey.100",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {thumbnailUrl ? (
                            <Box
                              component="img"
                              src={thumbnailUrl}
                              alt={listing.title}
                              sx={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              No Image
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="subtitle1"
                            fontWeight={700}
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {listing.title}
                          </Typography>
                          <Typography variant="body2" color="primary" fontWeight="bold">
                              {new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: "USD",
                              }).format(listing.price)}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <ListingFulfillmentLine option={fulfillmentOption} />
                          </Box>
                        </Box>
                      </Stack>
                      <Box>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => navigate(`/listing/${listing.id}`)}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          View Listing
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
              {activeListings.length > 6 && (
                <Button
                  variant="text"
                  onClick={() =>
                    setShowAllActiveListings((currentValue) => !currentValue)
                  }
                  sx={{ justifySelf: "flex-start" }}
                >
                  {showAllActiveListings
                    ? "Show fewer listings"
                    : `View ${activeListings.length - 6} more listing${
                        activeListings.length - 6 === 1 ? "" : "s"
                      }`}
                </Button>
              )}
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Reviews
          </Typography>
          {reviews.length === 0 ? (
            <Alert severity="info">No reviews yet.</Alert>
          ) : (
            <Stack spacing={2}>
              {reviews.map((review, index) => (
                <Box key={review.id}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="body1" fontWeight={600}>
                        {review.reviewerName || "Buyer"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        <Star fontSize="inherit" />
                        {Number(review.rating || 0).toFixed(1)}
                        {review.listingTitle ? ` • ${review.listingTitle}` : ""}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(review.updatedAt || review.createdAt)}
                    </Typography>
                  </Stack>
                  {review.comment && (
                    <Typography variant="body1" sx={{ mt: 1 }}>
                      {review.comment}
                    </Typography>
                  )}
                  {index < reviews.length - 1 && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}

export default SellerProfile;
