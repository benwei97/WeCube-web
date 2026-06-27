import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  CheckCircle,
  Delete,
  Edit,
  MoreVert,
  PendingActions,
  RestoreFromTrash,
  Star,
} from "@mui/icons-material";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteTransactionReviews,
  subscribeToReceivedReviews,
  subscribeToUserReviews,
} from "../utils/reviews";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";
import { cancelListingReviewPrompts } from "../utils/messaging";
import { getNormalizedFulfillmentFields, getPrimaryFulfillmentOption } from "../utils/listingUtils";
import {
  deleteImageFromS3,
  deleteMultipleImages,
  getS3PublicUrl,
  uploadAvatarToS3,
} from "../utils/s3";

const LISTING_PREVIEW_LIMIT = 6;
const PURCHASE_PREVIEW_LIMIT = 6;
const COMPACT_CARD_GRID_SX = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    lg: "repeat(3, minmax(0, 1fr))",
  },
  gap: 1.5,
};
const DASHBOARD_COMPACT_CARD_SX = {
  cursor: "pointer",
  minHeight: 96,
  height: "100%",
  transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
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
};
const DASHBOARD_COMPACT_CONTENT_SX = {
  p: 1.5,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 1.25,
  "&:last-child": { pb: 1.5 },
};
const DASHBOARD_CARD_META_SX = {
  mt: 0.5,
  minHeight: 18,
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const EMPTY_STATE_SX = {
  py: 3,
  color: "text.secondary",
};
function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [writtenReviewsByListingId, setWrittenReviewsByListingId] = useState({});
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [listingTab, setListingTab] = useState("active");
  const [showAllListings, setShowAllListings] = useState(false);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, listing: null });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, listing: null });

  useEffect(() => {
    if (!currentUser?.uid) {
      setListings([]);
      setPurchases([]);
      setWrittenReviewsByListingId({});
      setReceivedReviews([]);
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
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .sort((a, b) => getDateTime(b.createdAt) - getDateTime(a.createdAt));
        setListings(nextListings);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to dashboard listings:", error);
        setLoading(false);
      }
    );

    const unsubscribePurchases = onSnapshot(
      purchasesQuery,
      (snapshot) => {
        const nextPurchases = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .sort((a, b) => getDateTime(b.soldAt) - getDateTime(a.soldAt));
        setPurchases(nextPurchases);
      },
      (error) => {
        console.error("Error subscribing to dashboard purchases:", error);
      }
    );

    const unsubscribeWrittenReviews = subscribeToUserReviews(
      currentUser.uid,
      setWrittenReviewsByListingId,
      (error) => console.error("Error subscribing to written reviews:", error)
    );

    const unsubscribeReceivedReviews = subscribeToReceivedReviews(
      currentUser.uid,
      setReceivedReviews,
      (error) => console.error("Error subscribing to dashboard reviews:", error)
    );

    return () => {
      unsubscribeListings();
      unsubscribePurchases();
      unsubscribeWrittenReviews();
      unsubscribeReceivedReviews();
    };
  }, [currentUser]);

  const activeListings = useMemo(
    () =>
      listings.filter(
        (listing) => listing.status !== "sold" && listing.status !== "archived"
      ),
    [listings]
  );
  const soldListings = useMemo(
    () => listings.filter((listing) => listing.status === "sold"),
    [listings]
  );
  const pendingListings = useMemo(
    () => listings.filter((listing) => listing.status === "archived"),
    [listings]
  );

  const visibleListings =
    listingTab === "sold"
      ? soldListings
      : listingTab === "pending"
        ? pendingListings
        : activeListings;
  const displayedListings = showAllListings
    ? visibleListings
    : visibleListings.slice(0, LISTING_PREVIEW_LIMIT);
  const displayedPurchases = showAllPurchases
    ? purchases
    : purchases.slice(0, PURCHASE_PREVIEW_LIMIT);

  const reviewSummary = useMemo(() => {
    const reviewCount = receivedReviews.length;
    const averageRating =
      reviewCount > 0
        ? receivedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviewCount
        : null;
    return { reviewCount, averageRating };
  }, [receivedReviews]);

  const userName =
    `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim() ||
    "Your Account";

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(price || 0));

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  const handleAvatarButtonClick = () => avatarInputRef.current?.click();

  const handleAvatarSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !currentUser?.uid) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    setAvatarUploading(true);
    try {
      const uploadedAvatar = await uploadAvatarToS3(file, currentUser.uid);
      await updateDoc(doc(db, "users", currentUser.uid), {
        avatarUrl: uploadedAvatar.url,
        avatarS3Key: uploadedAvatar.s3Key,
      });

      if (currentUser.avatarS3Key) {
        try {
          await deleteImageFromS3(currentUser.avatarS3Key);
        } catch (cleanupError) {
          console.error("Error deleting previous avatar:", cleanupError);
        }
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      alert(error.message || "Failed to update avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const openActionMenu = (event, listing) => {
    event.stopPropagation();
    setActionMenu({ anchorEl: event.currentTarget, listing });
  };

  const closeActionMenu = () => setActionMenu({ anchorEl: null, listing: null });

  const handleStatusUpdate = async (listing, status) => {
    closeActionMenu();
    setStatusActionLoading((prev) => ({ ...prev, [listing.id]: true }));

    try {
      const now = new Date();
      const updates = { status, updatedAt: now };

      if (status === "archived") {
        updates.archivedAt = now;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
      }

      if (status === "active") {
        updates.archivedAt = null;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
      }

      await updateDoc(doc(db, "listings", listing.id), updates);
      if (listing.status === "sold" && status !== "sold") {
        await cancelListingReviewPrompts(listing.id, listing.userId);
        await deleteTransactionReviews(listing.id);
      }
    } catch (error) {
      console.error(`Error updating listing ${listing.id} to ${status}:`, error);
      alert("Failed to update listing status");
    } finally {
      setStatusActionLoading((prev) => ({ ...prev, [listing.id]: false }));
    }
  };

  const handleDeleteClick = (listing) => {
    closeActionMenu();
    setDeleteDialog({ open: true, listing });
  };

  const handleDeleteCancel = () => {
    if (!deleteLoading) setDeleteDialog({ open: false, listing: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.listing) return;

    setDeleteLoading(true);
    try {
      if (deleteDialog.listing.photos?.length) {
        await deleteMultipleImages(deleteDialog.listing.photos.map((photo) => photo.s3Key));
      }
      await deleteDoc(doc(db, "listings", deleteDialog.listing.id));
      setDeleteDialog({ open: false, listing: null });
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert(`Failed to delete listing: ${error.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderListingCard = (listing) => {
    const normalizedListing = {
      ...listing,
      ...getNormalizedFulfillmentFields(listing),
    };
    const fulfillmentOption = getPrimaryFulfillmentOption(normalizedListing);
    const soldDate = listing.status === "sold" ? formatDate(listing.soldAt) : null;
    const pendingDate =
      listing.status === "archived" ? formatDate(listing.archivedAt || listing.updatedAt) : null;
    const thumbnailUrl = listing.photos?.[0]?.s3Key
      ? getS3PublicUrl(listing.photos[0].s3Key)
      : null;
    const isActionMenuOpen =
      Boolean(actionMenu.anchorEl) && actionMenu.listing?.id === listing.id;

    return (
      <Card
        key={listing.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!actionMenu.anchorEl) navigate(`/listing/${listing.id}`);
        }}
        onKeyDown={(event) => {
          if (actionMenu.anchorEl) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(`/listing/${listing.id}`);
          }
        }}
        sx={{
          ...DASHBOARD_COMPACT_CARD_SX,
        }}
        variant="outlined"
      >
        <CardContent
          sx={DASHBOARD_COMPACT_CONTENT_SX}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
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
                opacity: listing.status === "sold" ? 0.58 : 1,
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
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
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
                  <Typography variant="body2" color="text.primary" fontWeight={600}>
                    {formatPrice(listing.price)}
                  </Typography>
                </Box>
              <IconButton
                size="small"
                aria-label="Listing actions"
                onClick={(event) => openActionMenu(event, listing)}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={Boolean(statusActionLoading[listing.id]) || deleteLoading}
                sx={{ mt: -0.5, mr: -0.75, flexShrink: 0 }}
              >
                <MoreVert fontSize="small" />
              </IconButton>
              <Menu
                anchorEl={actionMenu.anchorEl}
                open={isActionMenuOpen}
                onClose={closeActionMenu}
                onClick={(event) => event.stopPropagation()}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {listing.status !== "sold" && (
                  <MenuItem
                    onClick={() => {
                      closeActionMenu();
                      navigate(`/listing/${listing.id}`, {
                        state: { openMarkSoldDialog: true },
                      });
                    }}
                  >
                    <CheckCircle fontSize="small" sx={{ mr: 1.25 }} />
                    Mark as Sold
                  </MenuItem>
                )}
                {listing.status !== "archived" && (
                  <MenuItem onClick={() => handleStatusUpdate(listing, "archived")}>
                    <PendingActions fontSize="small" sx={{ mr: 1.25 }} />
                    Mark Pending
                  </MenuItem>
                )}
                {(listing.status === "archived" || listing.status === "sold") && (
                  <MenuItem onClick={() => handleStatusUpdate(listing, "active")}>
                    <RestoreFromTrash fontSize="small" sx={{ mr: 1.25 }} />
                    Mark Available
                  </MenuItem>
                )}
                <Divider sx={{ my: 0.5 }} />
                <MenuItem onClick={() => handleDeleteClick(listing)} sx={{ color: "error.main" }}>
                  <Delete fontSize="small" sx={{ mr: 1.25 }} />
                  Delete
                </MenuItem>
              </Menu>
            </Box>
              <Box sx={{ mt: 0.5 }}>
                <ListingFulfillmentLine option={fulfillmentOption} />
              </Box>
              {(soldDate || pendingDate) && (
                <Typography variant="caption" color="text.secondary" component="div" sx={DASHBOARD_CARD_META_SX}>
                  {soldDate ? `Sold on ${soldDate}` : `Pending since ${pendingDate}`}
                </Typography>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const renderPurchaseCard = (listing) => {
    const existingReview = writtenReviewsByListingId[listing.id];
    const thumbnailUrl = listing.photos?.[0]?.s3Key
      ? getS3PublicUrl(listing.photos[0].s3Key)
      : null;
    return (
      <Card
        key={listing.id}
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/listing/${listing.id}`)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(`/listing/${listing.id}`);
          }
        }}
        variant="outlined"
        sx={{
          ...DASHBOARD_COMPACT_CARD_SX,
        }}
      >
        <CardContent
          sx={DASHBOARD_COMPACT_CONTENT_SX}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
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
                opacity: listing.status === "sold" ? 0.58 : 1,
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
                fontWeight={500}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {listing.title}
              </Typography>
              <Typography variant="body2" color="text.primary" fontWeight={600}>
                {formatPrice(listing.price)}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <ListingFulfillmentLine option={getPrimaryFulfillmentOption(listing)} />
              </Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={DASHBOARD_CARD_META_SX}>
                Purchased on {formatDate(listing.soldAt)}
                {existingReview
                  ? ` · Reviewed: ${Number(existingReview.rating || 0).toFixed(1)} stars`
                  : ""}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  if (!currentUser) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          Dashboard
        </Typography>
        <Alert severity="info">Sign in to view your dashboard.</Alert>
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
      <Typography variant="h3" component="h1" fontWeight="bold" sx={{ mb: 3 }}>
        Dashboard
      </Typography>

      <Box>
        <Box sx={{ pt: 1, pb: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            alignItems={{ md: "flex-start" }}
          >
            <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ position: "relative", width: 82, height: 82, flexShrink: 0 }}>
                <Avatar
                  src={currentUser?.avatarUrl || undefined}
                  sx={{
                    width: 82,
                    height: 82,
                    border: "1px solid rgba(148, 163, 184, 0.22)",
                    boxShadow: "none",
                  }}
                >
                  {userName.charAt(0).toUpperCase()}
                </Avatar>
                <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarSelected} />
                <IconButton
                  size="small"
                  aria-label="Edit avatar"
                  onClick={handleAvatarButtonClick}
                  disabled={avatarUploading}
                  sx={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    boxShadow: "0 4px 12px rgba(31, 53, 99, 0.18)",
                    "&:hover": {
                      bgcolor: "background.paper",
                    },
                  }}
                >
                  {avatarUploading ? <CircularProgress size={16} /> : <Edit fontSize="small" />}
                </IconButton>
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h5"
                  fontWeight={700}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/user/${currentUser.uid}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/user/${currentUser.uid}`);
                    }
                  }}
                  sx={{
                    lineHeight: 1.15,
                    cursor: "pointer",
                    width: "fit-content",
                    "&:hover": {
                      color: "primary.main",
                    },
                    "&:focus-visible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: 3,
                      borderRadius: 1,
                    },
                  }}
                >
                  {userName}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    flexWrap: "wrap",
                    mt: 0.75,
                  }}
                >
                  <Star fontSize="inherit" />
                  {reviewSummary.reviewCount > 0
                    ? `${reviewSummary.averageRating?.toFixed(1)} · ${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? "" : "s"}`
                    : "No reviews yet"}
                  <Box component="span">·</Box>
                  <Box component="span">Member since {formatDate(currentUser?.createdAt)}</Box>
                </Typography>
                {currentUser?.email && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {currentUser.email}
                  </Typography>
                )}
              </Box>
            </Stack>

          </Stack>
        </Box>

        <Box sx={{ py: 2 }}>
          <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>
            My Listings
          </Typography>
          <Tabs
            value={listingTab}
            onChange={(_, nextTab) => {
              setListingTab(nextTab);
              setShowAllListings(false);
            }}
            sx={{ mb: 2 }}
          >
            <Tab label="Active" value="active" />
            <Tab label="Pending" value="pending" />
            <Tab label="Sold" value="sold" />
          </Tabs>
          {visibleListings.length === 0 ? (
            <Box sx={EMPTY_STATE_SX}>
              <Typography variant="body2">
                {listingTab === "sold"
                  ? "No sold listings yet."
                  : listingTab === "pending"
                    ? "No pending listings."
                    : "No active listings yet."}
              </Typography>
              {listingTab === "active" && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate("/sell")}
                  sx={{ mt: 0.75, px: 0 }}
                >
                  List a cube
                </Button>
              )}
            </Box>
          ) : (
            <>
              <Box sx={COMPACT_CARD_GRID_SX}>{displayedListings.map(renderListingCard)}</Box>
              {visibleListings.length > LISTING_PREVIEW_LIMIT && (
                <Button sx={{ mt: 2 }} onClick={() => setShowAllListings((prev) => !prev)}>
                  {showAllListings ? "Show Less" : `View ${visibleListings.length - LISTING_PREVIEW_LIMIT} More`}
                </Button>
              )}
            </>
          )}
        </Box>

        <Box sx={{ pt: 2, pb: 1 }}>
          <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>
            My Purchases
          </Typography>
          {purchases.length === 0 ? (
            <Box sx={EMPTY_STATE_SX}>
              <Typography variant="body2">No purchases yet.</Typography>
            </Box>
          ) : (
            <>
              <Box sx={COMPACT_CARD_GRID_SX}>{displayedPurchases.map(renderPurchaseCard)}</Box>
              {purchases.length > PURCHASE_PREVIEW_LIMIT && (
                <Button sx={{ mt: 2 }} onClick={() => setShowAllPurchases((prev) => !prev)}>
                  {showAllPurchases ? "Show Less" : `View ${purchases.length - PURCHASE_PREVIEW_LIMIT} More`}
                </Button>
              )}
            </>
          )}
        </Box>
      </Box>

      <Dialog open={deleteDialog.open} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Listing</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteDialog.listing
              ? `Permanently delete "${deleteDialog.listing.title}"? This cannot be undone.`
              : "Permanently delete this listing? This cannot be undone."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="inherit" disabled={deleteLoading}>
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleteLoading}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

function getDateTime(dateValue) {
  if (!dateValue) return 0;
  const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default Dashboard;
