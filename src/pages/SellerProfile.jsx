import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowBack, Close, Star } from "@mui/icons-material";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  formatListingPrice,
  getPrimaryFulfillmentOption,
  isListingModerationHidden,
} from "../utils/listingUtils";
import { subscribeToSellerReviews } from "../utils/reviews";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";
import { getS3PublicUrl } from "../utils/s3";

const SECTION_SX = {
  py: 2.25,
};

const COMPACT_CARD_GRID_SX = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    lg: "repeat(3, minmax(0, 1fr))",
  },
  gap: 1.5,
};

const COMPACT_CARD_SX = {
  minHeight: 96,
  height: "100%",
  borderColor: "rgba(148, 163, 184, 0.22)",
  bgcolor: "rgba(248, 250, 252, 0.78)",
  boxShadow: "none",
};

const BACK_BUTTON_SX = {
  color: "text.primary",
  borderColor: "rgba(148, 163, 184, 0.22)",
  "&:hover": {
    borderColor: "primary.main",
    bgcolor: "rgba(100, 108, 255, 0.04)",
  },
};

function SellerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewerProfiles, setReviewerProfiles] = useState({});
  const [sellerListings, setSellerListings] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
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
        const listings = snapshot.docs
          .map((listingDoc) => ({
            id: listingDoc.id,
            ...listingDoc.data(),
          }))
          .filter((listing) => !isListingModerationHidden(listing));
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

  useEffect(() => {
    const reviewerIds = [
      ...new Set(reviews.map((review) => review.reviewerId).filter(Boolean)),
    ];

    if (reviewerIds.length === 0) {
      setReviewerProfiles({});
      return;
    }

    let active = true;

    const loadReviewerProfiles = async () => {
      const profileEntries = await Promise.all(
        reviewerIds.map(async (reviewerId) => {
          try {
            const reviewerDoc = await getDoc(doc(db, "users", reviewerId));
            return [
              reviewerId,
              reviewerDoc.exists() ? reviewerDoc.data() : null,
            ];
          } catch (error) {
            console.error("Error loading reviewer profile:", error);
            return [reviewerId, null];
          }
        })
      );

      if (active) {
        setReviewerProfiles(Object.fromEntries(profileEntries));
      }
    };

    loadReviewerProfiles();

    return () => {
      active = false;
    };
  }, [reviews]);

  const sellerName =
    `${seller?.firstName || ""} ${seller?.lastName || ""}`.trim() || "Seller";

  const activeListings = useMemo(
    () =>
      sellerListings.filter(
        (listing) => listing.status !== "sold"
      ),
    [sellerListings]
  );
  const visibleActiveListings = showAllActiveListings
    ? activeListings
    : activeListings.slice(0, 6);
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

  const getReviewDisplayData = (review) => {
    const reviewerProfile = reviewerProfiles[review.reviewerId];
    const reviewerName = review.reviewerName || "Buyer";

    return {
      reviewerAvatarUrl:
        reviewerProfile?.avatarUrl || reviewerProfile?.photoURL || null,
      reviewerName,
      reviewDate: formatDate(review.updatedAt || review.createdAt),
    };
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
        <Button onClick={() => navigate(-1)} sx={{ mt: 2, ...BACK_BUTTON_SX }} variant="outlined">
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
        sx={{ mb: 3, ...BACK_BUTTON_SX }}
      >
        Back
      </Button>

      <Box
        sx={{
          pt: 1,
          pb: 2,
        }}
      >
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

      </Box>

      <Box sx={SECTION_SX}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Active Listings
          </Typography>
          {activeListings.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No active listings yet.
            </Typography>
          ) : (
            <Box sx={COMPACT_CARD_GRID_SX}>
              {visibleActiveListings.map((listing) => {
                const fulfillmentOption = getPrimaryFulfillmentOption(listing);
                const thumbnailUrl = listing.photos?.[0]?.s3Key
                  ? getS3PublicUrl(listing.photos[0].s3Key)
                  : null;
                return (
                  <Card
                    key={listing.id}
                    variant="outlined"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/listing/${listing.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/listing/${listing.id}`);
                      }
                    }}
                    sx={{
                      ...COMPACT_CARD_SX,
                      cursor: "pointer",
                      transition:
                        "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
                      "&:hover": {
                        transform: "translateY(-2px)",
                        boxShadow: 2,
                        borderColor: "primary.main",
                      },
                      "&:focus-visible": {
                        outline: "2px solid",
                        outlineColor: "primary.main",
                        outlineOffset: 2,
                      },
                    }}
                  >
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
                            position: "relative",
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
                          {listing.status === "archived" && (
                            <Chip
                              label="Pending"
                              color="error"
                              size="small"
                              sx={{
                                position: "absolute",
                                left: 4,
                                top: 4,
                                height: 18,
                                fontSize: "0.62rem",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                "& .MuiChip-label": { px: 0.65 },
                              }}
                            />
                          )}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="subtitle1"
                            fontWeight={500}
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {listing.title}
                          </Typography>
                          <Typography variant="body2" color="text.primary" fontWeight={600} sx={{ mt: -0.25 }}>
                              {formatListingPrice(listing.price)}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <ListingFulfillmentLine option={fulfillmentOption} />
                          </Box>
                        </Box>
                      </Stack>
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
        </Box>

        <Box
          sx={{
            ...SECTION_SX,
            pt: 2,
          }}
        >
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Reviews
          </Typography>
          {reviews.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No reviews yet.
            </Typography>
          ) : (
            <Box sx={COMPACT_CARD_GRID_SX}>
              {reviews.map((review) => {
                const {
                  reviewerAvatarUrl,
                  reviewerName,
                  reviewDate,
                } = getReviewDisplayData(review);
                const shouldShowFullReviewAction =
                  (review.comment || "").trim().length > 120;

                return (
                  <Card key={review.id} variant="outlined" sx={COMPACT_CARD_SX}>
                    <CardContent
                      sx={{
                        p: 1.5,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: 0.85,
                        "&:last-child": { pb: 1.5 },
                      }}
                    >
	                      <Stack direction="row" spacing={1.25} alignItems="center">
	                        <Avatar
	                          src={reviewerAvatarUrl || undefined}
	                          sx={{
	                            width: 56,
	                            height: 56,
	                            bgcolor: "primary.main",
	                            fontSize: "1.1rem",
	                            fontWeight: 700,
	                            flexShrink: 0,
	                          }}
	                        >
	                          {reviewerName.charAt(0).toUpperCase()}
	                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="subtitle1"
                            fontWeight={500}
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {reviewerName}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 0.5,
                            }}
                          >
                            <Star fontSize="inherit" />
                            {Number(review.rating || 0).toFixed(1)}
                            {review.listingTitle && (
                              <>
                                <Box component="span">•</Box>
                                <Box
                                  component="span"
                                  sx={{
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {review.listingTitle}
                                </Box>
                              </>
                            )}
                            {reviewDate && (
                              <>
                                <Box component="span">•</Box>
                                <Box component="span">{reviewDate}</Box>
                              </>
                            )}
                          </Typography>
                        </Box>
                      </Stack>
                      {review.comment && (
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                            overflow: "hidden",
                            lineHeight: 1.35,
                          }}
                        >
                          {review.comment}
                        </Typography>
                      )}
                      {shouldShowFullReviewAction && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setSelectedReview(review)}
                          sx={{ alignSelf: "flex-start", px: 0, mt: -0.4 }}
                        >
                          See more
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Box>
        <Dialog
          open={Boolean(selectedReview)}
          onClose={() => setSelectedReview(null)}
          maxWidth="sm"
          fullWidth
        >
          {selectedReview && (() => {
            const {
              reviewerAvatarUrl,
              reviewerName,
              reviewDate,
            } = getReviewDisplayData(selectedReview);

            return (
              <>
                <DialogTitle sx={{ pr: 6 }}>
                  Review
                  <IconButton
                    aria-label="Close review"
                    onClick={() => setSelectedReview(null)}
                    sx={{ position: "absolute", right: 8, top: 8 }}
                  >
                    <Close />
                  </IconButton>
                </DialogTitle>
                <DialogContent>
                  <Stack spacing={2}>
	                    <Stack direction="row" spacing={1.5} alignItems="center">
	                      <Avatar
	                        src={reviewerAvatarUrl || undefined}
	                        sx={{
	                          width: 64,
	                          height: 64,
	                          bgcolor: "primary.main",
	                          fontSize: "1.2rem",
	                          fontWeight: 700,
	                          flexShrink: 0,
	                        }}
	                      >
	                        {reviewerName.charAt(0).toUpperCase()}
	                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {reviewerName}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 0.5,
                          }}
                        >
                          <Star fontSize="inherit" />
                          {Number(selectedReview.rating || 0).toFixed(1)}
                          {selectedReview.listingTitle && (
                            <>
                              <Box component="span">•</Box>
                              <Box component="span">{selectedReview.listingTitle}</Box>
                            </>
                          )}
                          {reviewDate && (
                            <>
                              <Box component="span">•</Box>
                              <Box component="span">{reviewDate}</Box>
                            </>
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography
                      variant="body1"
                      sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}
                    >
                      {selectedReview.comment || "No written review."}
                    </Typography>
                  </Stack>
                </DialogContent>
              </>
            );
          })()}
        </Dialog>
    </Box>
  );
}

export default SellerProfile;
