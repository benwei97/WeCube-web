import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  Delete,
  PendingActions,
  RestoreFromTrash,
  Visibility,
} from "@mui/icons-material";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
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
import { deleteMultipleImages, getS3PublicUrl } from "../utils/s3";
import {
  getNormalizedFulfillmentFields,
  getPrimaryFulfillmentOption,
} from "../utils/listingUtils";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";

function MyListings() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusActionLoading, setStatusActionLoading] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    listing: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setListings([]);
      setLoading(false);
      return undefined;
    }

    const listingsQuery = query(
      collection(db, "listings"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
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
        console.error("Error subscribing to my listings:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
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
  const archivedListings = useMemo(
    () => listings.filter((listing) => listing.status === "archived"),
    [listings]
  );

  const visibleListings =
    tab === "sold"
      ? soldListings
      : tab === "archived"
        ? archivedListings
        : activeListings;

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);

  const formatDate = (dateValue) => {
    if (!dateValue) return null;
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };

  const handleStatusUpdate = async (listingId, status) => {
    setStatusActionLoading((prev) => ({
      ...prev,
      [listingId]: true,
    }));

    try {
      const updates = {
        status,
        updatedAt: new Date(),
      };

      if (status === "archived") {
        updates.archivedAt = new Date();
      }

      if (status === "active") {
        updates.archivedAt = null;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
      }

      await updateDoc(doc(db, "listings", listingId), updates);
    } catch (error) {
      console.error(`Error updating listing ${listingId} to ${status}:`, error);
      alert("Failed to update listing status");
    } finally {
      setStatusActionLoading((prev) => ({
        ...prev,
        [listingId]: false,
      }));
    }
  };

  const handleDeleteClick = (listing) => {
    setDeleteDialog({
      open: true,
      listing,
    });
  };

  const handleDeleteCancel = () => {
    if (deleteLoading) return;
    setDeleteDialog({
      open: false,
      listing: null,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.listing) return;

    setDeleteLoading(true);
    try {
      if (deleteDialog.listing.photos?.length) {
        await deleteMultipleImages(
          deleteDialog.listing.photos.map((photo) => photo.s3Key)
        );
      }

      await deleteDoc(doc(db, "listings", deleteDialog.listing.id));
      setDeleteDialog({
        open: false,
        listing: null,
      });
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
    const soldDate = formatDate(listing.soldAt);
    const archivedDate = formatDate(listing.archivedAt || listing.updatedAt);

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
          isPending={listing.status === "archived"}
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
              {formatPrice(listing.price)}
            </Typography>
            <ListingFulfillmentLine option={fulfillmentOption} />
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              label={
                listing.status === "sold"
                  ? "Sold"
                  : listing.status === "archived"
                    ? "Pending"
                    : "Active"
              }
              color={
                listing.status === "sold"
                  ? "default"
                  : listing.status === "archived"
                    ? "error"
                    : "success"
              }
              size="small"
            />
          </Stack>

          <Box sx={{ color: "text.secondary" }}>
            {listing.puzzleType && (
              <Typography variant="body2">Type: {listing.puzzleType}</Typography>
            )}
            {listing.brand && (
              <Typography variant="body2">Brand: {listing.brand}</Typography>
            )}
            {soldDate && listing.status === "sold" && (
              <Typography variant="body2">Sold on {soldDate}</Typography>
            )}
            {archivedDate && listing.status === "archived" && (
              <Typography variant="body2">Pending since {archivedDate}</Typography>
            )}
          </Box>

          <Divider />

          <Stack direction="row" spacing={1} sx={{ mt: "auto" }}>
            <Button
              variant="outlined"
              startIcon={<Visibility />}
              onClick={() => navigate(`/listing/${listing.id}`)}
            >
              View
            </Button>
            {listing.status === "archived" || listing.status === "sold" ? (
              <Button
                variant="contained"
                startIcon={<RestoreFromTrash />}
                onClick={() => handleStatusUpdate(listing.id, "active")}
                disabled={Boolean(statusActionLoading[listing.id])}
              >
                Mark Available
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="error"
                startIcon={<PendingActions />}
                onClick={() => handleStatusUpdate(listing.id, "archived")}
                disabled={Boolean(statusActionLoading[listing.id])}
              >
                Mark Pending
              </Button>
            )}
            <Button
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={() => handleDeleteClick(listing)}
              disabled={deleteLoading}
            >
              Delete
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  if (!currentUser) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          My Listings
        </Typography>
        <Alert severity="info">Sign in to view and manage your listings.</Alert>
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
        My Listings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Manage active listings, sold history, and pending exchanges.
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, nextTab) => setTab(nextTab)}
        sx={{ mb: 3 }}
      >
        <Tab label={`Active (${activeListings.length})`} value="active" />
        <Tab label={`Sold (${soldListings.length})`} value="sold" />
        <Tab label={`Pending (${archivedListings.length})`} value="archived" />
      </Tabs>

      {visibleListings.length === 0 ? (
        <Alert severity="info">
          {tab === "archived"
            ? "You do not have any pending listings yet."
            : tab === "sold"
              ? "You do not have any sold listings yet."
              : "You do not have any active listings yet."}
        </Alert>
      ) : (
        <Box sx={LISTING_CARD_GRID_SX}>
          {visibleListings.map(renderListingCard)}
        </Box>
      )}

      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        maxWidth="xs"
        fullWidth
      >
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
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MyListings;
