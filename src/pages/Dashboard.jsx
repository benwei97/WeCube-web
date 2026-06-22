import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircle,
  Delete,
  MoreVert,
  PendingActions,
  RestoreFromTrash,
  Star,
} from "@mui/icons-material";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteTransactionReviews,
  submitTransactionReview,
  subscribeToReceivedReviews,
  subscribeToUserReviews,
} from "../utils/reviews";
import {
  LISTING_CARD_CONTENT_SX,
  LISTING_CARD_GRID_SX,
  LISTING_CARD_SX,
  LISTING_CARD_TEXT_STACK_SX,
  LISTING_CARD_TITLE_SX,
  ListingCardMediaFrame,
} from "../components/ListingStatusDecorators";
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

function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [writtenReviewsByListingId, setWrittenReviewsByListingId] = useState({});
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [userNamesById, setUserNamesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [listingTab, setListingTab] = useState("active");
  const [showAllListings, setShowAllListings] = useState(false);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, listing: null });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, listing: null });
  const [reviewDialog, setReviewDialog] = useState({ open: false, task: null });
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const pendingReviewTasks = useMemo(() => {
    const purchaseTasks = purchases
      .filter((listing) => listing.status === "sold" && !writtenReviewsByListingId[listing.id])
      .map((listing) => ({
        id: `buyer-${listing.id}`,
        listing,
        recipientId: listing.userId,
        recipientRole: "seller",
        title: "Review Seller",
        subtitle: "You bought this puzzle",
      }));

    const saleTasks = soldListings
      .filter((listing) => listing.buyerId && !writtenReviewsByListingId[listing.id])
      .map((listing) => ({
        id: `seller-${listing.id}`,
        listing,
        recipientId: listing.buyerId,
        recipientRole: "buyer",
        title: "Review Buyer",
        subtitle: "You sold this puzzle",
      }));

    return [...purchaseTasks, ...saleTasks].sort(
      (a, b) => getDateTime(b.listing.soldAt) - getDateTime(a.listing.soldAt)
    );
  }, [purchases, soldListings, writtenReviewsByListingId]);

  const writtenReviews = useMemo(
    () =>
      Object.values(writtenReviewsByListingId).sort(
        (a, b) => getDateTime(b.updatedAt || b.createdAt) - getDateTime(a.updatedAt || a.createdAt)
      ),
    [writtenReviewsByListingId]
  );

  const reviewSummary = useMemo(() => {
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
    pendingReviewTasks.forEach((task) => task.recipientId && userIds.add(task.recipientId));
    writtenReviews.forEach((review) => review.recipientId && userIds.add(review.recipientId));

    const missingUserIds = [...userIds].filter((userId) => !userNamesById[userId]);
    if (missingUserIds.length === 0) return undefined;

    let cancelled = false;
    Promise.all(
      missingUserIds.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (!userDoc.exists()) return [userId, "User"];
          const userData = userDoc.data();
          return [
            userId,
            `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
              userData.email ||
              "User",
          ];
        } catch (error) {
          console.error("Error fetching review user name:", error);
          return [userId, "User"];
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setUserNamesById((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pendingReviewTasks, userNamesById, writtenReviews]);

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

  const openReviewDialog = (task) => {
    const existingReview = writtenReviewsByListingId[task.listing.id];
    setReviewDialog({ open: true, task });
    setReviewForm({
      rating: existingReview?.rating || 5,
      comment: existingReview?.comment || "",
    });
  };

  const closeReviewDialog = () => {
    if (submittingReview) return;
    setReviewDialog({ open: false, task: null });
    setReviewForm({ rating: 5, comment: "" });
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
        recipientName: userNamesById[reviewDialog.task.recipientId] || "User",
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

  const renderListingCard = (listing) => {
    const normalizedListing = {
      ...listing,
      ...getNormalizedFulfillmentFields(listing),
    };
    const fulfillmentOption = getPrimaryFulfillmentOption(normalizedListing);
    const soldDate = listing.status === "sold" ? formatDate(listing.soldAt) : null;
    const pendingDate =
      listing.status === "archived" ? formatDate(listing.archivedAt || listing.updatedAt) : null;
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
          ...LISTING_CARD_SX,
          cursor: "pointer",
          transition: "transform 0.2s, box-shadow 0.2s",
          "&:hover": { transform: "translateY(-2px)", boxShadow: 3 },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        <ListingCardMediaFrame
          imageUrl={listing.photos?.[0] ? getS3PublicUrl(listing.photos[0].s3Key) : null}
          alt={listing.title}
          isSold={listing.status === "sold"}
          isPending={listing.status === "archived"}
          imageSx={{ objectFit: "cover", backgroundColor: "grey.50" }}
          placeholderSx={{
            backgroundColor: "grey.100",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        />
        <CardContent sx={LISTING_CARD_CONTENT_SX}>
          <Box sx={LISTING_CARD_TEXT_STACK_SX}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Typography variant="h6" sx={{ ...LISTING_CARD_TITLE_SX, flex: 1 }}>
                {listing.title}
              </Typography>
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
            <Typography variant="h5" color="primary" fontWeight="bold" sx={{ lineHeight: 1.1 }}>
              {formatPrice(listing.price)}
            </Typography>
            <ListingFulfillmentLine option={fulfillmentOption} />
          </Box>
          <Box sx={{ color: "text.secondary" }}>
            {listing.brand && <Typography variant="body2">Brand: {listing.brand}</Typography>}
            {soldDate && <Typography variant="body2">Sold on {soldDate}</Typography>}
            {pendingDate && <Typography variant="body2">Pending since {pendingDate}</Typography>}
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderPurchaseCard = (listing) => {
    const existingReview = writtenReviewsByListingId[listing.id];
    return (
      <Card
        key={listing.id}
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/listing/${listing.id}`)}
        sx={{ ...LISTING_CARD_SX, cursor: "pointer" }}
      >
        <ListingCardMediaFrame
          imageUrl={listing.photos?.[0] ? getS3PublicUrl(listing.photos[0].s3Key) : null}
          alt={listing.title}
          isSold={listing.status === "sold"}
          imageSx={{ objectFit: "cover", backgroundColor: "grey.50" }}
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
              {formatPrice(listing.price)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.12 }}>
              Purchased on {formatDate(listing.soldAt)}
            </Typography>
            <ListingFulfillmentLine option={getPrimaryFulfillmentOption(listing)} />
          </Box>
          <Alert severity={existingReview ? "success" : "info"}>
            {existingReview
              ? `Reviewed: ${Number(existingReview.rating || 0).toFixed(1)} stars`
              : "You have not reviewed this seller yet."}
          </Alert>
        </CardContent>
      </Card>
    );
  };

  const renderReviewTask = (task) => (
    <Card key={task.id} variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {task.listing.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {task.subtitle} · {formatDate(task.listing.soldAt)}
            </Typography>
          </Box>
          <Typography variant="body2">
            {task.title} for {userNamesById[task.recipientId] || "User"}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => openReviewDialog(task)}>
              {task.title}
            </Button>
            <Button variant="outlined" onClick={() => navigate(`/listing/${task.listing.id}`)}>
              Listing
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );

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
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Your profile, listings, purchases, and reviews in one place.
      </Typography>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ md: "center" }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <Avatar src={currentUser?.avatarUrl || undefined} sx={{ width: 72, height: 72 }}>
                {userName.charAt(0).toUpperCase()}
              </Avatar>
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarSelected} />
              <Button variant="outlined" size="small" onClick={handleAvatarButtonClick} disabled={avatarUploading}>
                {avatarUploading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={14} />
                    <Box component="span">Uploading...</Box>
                  </Stack>
                ) : (
                  "Add Avatar"
                )}
              </Button>
            </Box>

            <Box sx={{ flex: 1 }}>
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
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                <Chip label={`${activeListings.length} active`} />
                <Chip label={`${pendingListings.length} pending`} />
                <Chip label={`${soldListings.length} sold`} />
                <Chip label={`${purchases.length} purchased`} />
                <Chip label={`${pendingReviewTasks.length} to review`} color={pendingReviewTasks.length ? "primary" : "default"} />
              </Stack>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Star fontSize="inherit" />
                {reviewSummary.reviewCount > 0
                  ? `${reviewSummary.averageRating?.toFixed(1)} · ${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? "" : "s"}`
                  : "No reviews yet"}
              </Typography>
              <Button sx={{ mt: 1 }} variant="outlined" onClick={() => navigate(`/user/${currentUser.uid}`)}>
                Public Profile
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Listings
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Manage active listings, pending exchanges, and sold history.
              </Typography>
            </Box>
            <Button variant="contained" onClick={() => navigate("/sell")}>
              Sell Puzzle
            </Button>
          </Stack>
          <Tabs
            value={listingTab}
            onChange={(_, nextTab) => {
              setListingTab(nextTab);
              setShowAllListings(false);
            }}
            sx={{ mb: 2 }}
          >
            <Tab label={`Active (${activeListings.length})`} value="active" />
            <Tab label={`Pending (${pendingListings.length})`} value="pending" />
            <Tab label={`Sold (${soldListings.length})`} value="sold" />
          </Tabs>
          {visibleListings.length === 0 ? (
            <Alert severity="info">
              {listingTab === "sold"
                ? "You do not have any sold listings yet."
                : listingTab === "pending"
                  ? "You do not have any pending listings yet."
                  : "You do not have any active listings yet."}
            </Alert>
          ) : (
            <>
              <Box sx={LISTING_CARD_GRID_SX}>{displayedListings.map(renderListingCard)}</Box>
              {visibleListings.length > LISTING_PREVIEW_LIMIT && (
                <Button sx={{ mt: 2 }} onClick={() => setShowAllListings((prev) => !prev)}>
                  {showAllListings ? "Show Less" : `View ${visibleListings.length - LISTING_PREVIEW_LIMIT} More`}
                </Button>
              )}
            </>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight="bold">
            Purchases
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Recent puzzles you bought.
          </Typography>
          {purchases.length === 0 ? (
            <Alert severity="info">You do not have any purchases yet.</Alert>
          ) : (
            <>
              <Box sx={LISTING_CARD_GRID_SX}>{displayedPurchases.map(renderPurchaseCard)}</Box>
              {purchases.length > PURCHASE_PREVIEW_LIMIT && (
                <Button sx={{ mt: 2 }} onClick={() => setShowAllPurchases((prev) => !prev)}>
                  {showAllPurchases ? "Show Less" : `View ${purchases.length - PURCHASE_PREVIEW_LIMIT} More`}
                </Button>
              )}
            </>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight="bold">
            Reviews
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Finish pending reviews and see recent feedback.
          </Typography>
          <Stack spacing={2}>
            {pendingReviewTasks.length > 0 ? (
              <>
                <Typography variant="subtitle1" fontWeight={700}>
                  To Review
                </Typography>
                {pendingReviewTasks.slice(0, 4).map(renderReviewTask)}
              </>
            ) : (
              <Alert severity="success">You do not have any reviews left to write.</Alert>
            )}

            <Divider />

            <Typography variant="subtitle1" fontWeight={700}>
              Recent Feedback
            </Typography>
            {receivedReviews.length === 0 ? (
              <Alert severity="info">No one has reviewed you yet.</Alert>
            ) : (
              receivedReviews.slice(0, 3).map((review) => (
                <Card key={review.id} variant="outlined">
                  <CardContent>
                    <Typography variant="body1" fontWeight={600}>
                      {review.reviewerName || "User"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                      <Star fontSize="inherit" />
                      {Number(review.rating || 0).toFixed(1)}
                      {review.listingTitle ? ` · ${review.listingTitle}` : ""}
                    </Typography>
                    {review.comment && <Typography variant="body1">{review.comment}</Typography>}
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        </Paper>
      </Stack>

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
              <Stack direction="row" spacing={0.5}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <IconButton
                    key={value}
                    aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                    onClick={() => setReviewForm((prev) => ({ ...prev, rating: value }))}
                    size="small"
                    sx={{ color: value <= reviewForm.rating ? "primary.main" : "action.disabled" }}
                  >
                    <Star />
                  </IconButton>
                ))}
              </Stack>
            </Box>
            <TextField
              label="Review"
              multiline
              minRows={4}
              value={reviewForm.comment}
              onChange={(event) =>
                setReviewForm((prev) => ({ ...prev, comment: event.target.value }))
              }
              placeholder="Share how the transaction went."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReviewDialog} color="inherit" disabled={submittingReview}>
            Cancel
          </Button>
          <Button onClick={handleReviewSubmit} variant="contained" disabled={submittingReview}>
            Save Review
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
