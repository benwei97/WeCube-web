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
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { ArrowBack, Block, Close, Flag, MoreVert, Star } from "@mui/icons-material";
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
import { useAuth } from "../contexts/useAuth";
import {
  formatListingPrice,
  getPrimaryFulfillmentOption,
  isListingModerationHidden,
} from "../utils/listingUtils";
import { subscribeToSellerReviews } from "../utils/reviews";
import { blockUser } from "../utils/messaging";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";
import { getS3PublicUrl } from "../utils/s3";
import {
  characterCountText,
  clampText,
  INPUT_LIMITS,
} from "../utils/inputLimits";

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
const USER_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abusive behavior" },
  { value: "fake_identity", label: "Fake identity or impersonation" },
  { value: "suspicious_activity", label: "Suspicious listings or messages" },
  { value: "other", label: "Other" },
];

function SellerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewerProfiles, setReviewerProfiles] = useState({});
  const [sellerListings, setSellerListings] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllActiveListings, setShowAllActiveListings] = useState(false);
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] = useState(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSnackbar, setReportSnackbar] = useState(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const isProfileMenuOpen = Boolean(profileMenuAnchorEl);

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

  const openReportDialog = () => {
    setProfileMenuAnchorEl(null);

    if (!currentUser) {
      setReportSnackbar({
        severity: "info",
        message: "Please sign in to report this user.",
      });
      return;
    }

    if (currentUser.uid === userId) {
      setReportSnackbar({
        severity: "info",
        message: "You cannot report your own profile.",
      });
      return;
    }

    setReportReason("");
    setReportDetails("");
    setShowReportDialog(true);
  };

  const closeReportDialog = () => {
    if (submittingReport) return;

    setShowReportDialog(false);
    setReportReason("");
    setReportDetails("");
  };

  const handleSubmitUserReport = async () => {
    if (!currentUser?.uid || !userId || !reportReason) {
      return;
    }

    const reportId = `${currentUser.uid}_${userId}`;
    const reportRef = doc(db, "userReports", reportId);

    setSubmittingReport(true);

    try {
      const now = new Date();
      await setDoc(reportRef, {
        reportedUserId: userId,
        reportedUserName: sellerName,
        reporterId: currentUser.uid,
        reporterName:
          `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
        reason: reportReason,
        details: reportDetails.trim(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      setShowReportDialog(false);
      setReportReason("");
      setReportDetails("");
      setReportSnackbar({
        severity: "success",
        message: "Report submitted. We will review this user.",
      });
    } catch (error) {
      console.error("Error submitting user report:", error);
      setReportSnackbar({
        severity: error.code === "permission-denied" ? "info" : "error",
        message:
          error.code === "permission-denied"
            ? "This report could not be submitted. You may have already reported this user."
            : "Unable to submit this report right now. Please try again.",
      });
    } finally {
      setSubmittingReport(false);
    }
  };

  const openBlockDialog = () => {
    setProfileMenuAnchorEl(null);

    if (!currentUser) {
      setReportSnackbar({
        severity: "info",
        message: "Please sign in to block this user.",
      });
      return;
    }

    if (currentUser.uid === userId) {
      setReportSnackbar({
        severity: "info",
        message: "You cannot block your own profile.",
      });
      return;
    }

    setBlockDialogOpen(true);
  };

  const closeBlockDialog = () => {
    if (blockingUser) return;
    setBlockDialogOpen(false);
  };

  const handleBlockUser = async () => {
    if (!currentUser?.uid || !userId) {
      return;
    }

    setBlockingUser(true);
    try {
      await blockUser(currentUser.uid, userId);
      setBlockDialogOpen(false);
      setReportSnackbar({
        severity: "success",
        message: "User blocked. They can no longer message you.",
      });
    } catch (error) {
      console.error("Error blocking user:", error);
      setReportSnackbar({
        severity: "error",
        message: "Unable to block this user right now. Please try again.",
      });
    } finally {
      setBlockingUser(false);
    }
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="center">
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
          {currentUser?.uid !== userId && (
            <Box>
              <IconButton
                onClick={(event) => setProfileMenuAnchorEl(event.currentTarget)}
                aria-label="Profile options"
                aria-controls={isProfileMenuOpen ? "seller-profile-actions" : undefined}
                aria-haspopup="true"
                aria-expanded={isProfileMenuOpen ? "true" : undefined}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  color: "text.secondary",
                }}
              >
                <MoreVert />
              </IconButton>
              <Menu
                id="seller-profile-actions"
                anchorEl={profileMenuAnchorEl}
                open={isProfileMenuOpen}
                onClose={() => setProfileMenuAnchorEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <MenuItem onClick={openReportDialog}>
                  <Flag fontSize="small" sx={{ mr: 1.25 }} />
                  Report user
                </MenuItem>
                <MenuItem onClick={openBlockDialog} sx={{ color: "error.main" }}>
                  <Block fontSize="small" sx={{ mr: 1.25 }} />
                  Block user
                </MenuItem>
              </Menu>
            </Box>
          )}
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
        <Dialog
          open={showReportDialog}
          onClose={closeReportDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Report User</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <DialogContentText>
                Tell us what looks wrong. Reports help us review unsafe or
                abusive marketplace behavior.
              </DialogContentText>
              <FormControl fullWidth required>
                <InputLabel id="user-report-reason-label">Reason</InputLabel>
                <Select
                  labelId="user-report-reason-label"
                  label="Reason"
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  disabled={submittingReport}
                >
                  {USER_REPORT_REASONS.map((reason) => (
                    <MenuItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Details"
                multiline
                minRows={4}
                value={reportDetails}
                onChange={(event) =>
                  setReportDetails(
                    clampText(event.target.value, INPUT_LIMITS.REPORT_DETAILS)
                  )
                }
                disabled={submittingReport}
                helperText={characterCountText(
                  reportDetails,
                  INPUT_LIMITS.REPORT_DETAILS
                )}
                slotProps={{
                  htmlInput: {
                    maxLength: INPUT_LIMITS.REPORT_DETAILS,
                  },
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeReportDialog} color="inherit" disabled={submittingReport}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitUserReport}
              variant="contained"
              disabled={submittingReport || !reportReason}
            >
              {submittingReport ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={blockDialogOpen}
          onClose={closeBlockDialog}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Block User</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Block {sellerName}? They will not be able to start or continue
              conversations with you.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeBlockDialog} color="inherit" disabled={blockingUser}>
              Cancel
            </Button>
            <Button
              onClick={handleBlockUser}
              color="error"
              variant="contained"
              disabled={blockingUser}
            >
              {blockingUser ? "Blocking..." : "Block User"}
            </Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          open={Boolean(reportSnackbar)}
          autoHideDuration={3600}
          onClose={() => setReportSnackbar(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {reportSnackbar && (
            <Alert
              onClose={() => setReportSnackbar(null)}
              severity={reportSnackbar.severity}
              variant="filled"
              sx={{ width: "100%" }}
            >
              {reportSnackbar.message}
            </Alert>
          )}
        </Snackbar>
    </Box>
  );
}

export default SellerProfile;
