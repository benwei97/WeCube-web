import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
  MoreVert,
  PendingActions,
  RestoreFromTrash,
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
  const [actionMenu, setActionMenu] = useState({
    anchorEl: null,
    listing: null,
  });

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

  const openActionMenu = (event, listing) => {
    event.stopPropagation();
    setActionMenu({
      anchorEl: event.currentTarget,
      listing,
    });
  };

  const closeActionMenu = () => {
    setActionMenu({
      anchorEl: null,
      listing: null,
    });
  };

  const handleStatusUpdate = async (listingId, status) => {
    closeActionMenu();
    setStatusActionLoading((prev) => ({
      ...prev,
      [listingId]: true,
    }));

    try {
      const now = new Date();
      const updates = {
        status,
        updatedAt: now,
      };

      if (status === "sold") {
        updates.soldAt = now;
        updates.archivedAt = null;
        updates.soldMethod = "seller_marked_sold";
        updates.buyerId = null;
        updates.soldConversationId = null;
      }

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
    closeActionMenu();
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
    const isActionMenuOpen =
      Boolean(actionMenu.anchorEl) && actionMenu.listing?.id === listing.id;

    return (
      <Card
        key={listing.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (actionMenu.anchorEl) {
            return;
          }
          navigate(`/listing/${listing.id}`);
        }}
        onKeyDown={(event) => {
          if (actionMenu.anchorEl) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(`/listing/${listing.id}`);
          }
        }}
        sx={{
          ...LISTING_CARD_SX,
          cursor: "pointer",
          transition: "transform 0.2s, box-shadow 0.2s",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: 3,
          },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
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
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Typography variant="h6" sx={{ ...LISTING_CARD_TITLE_SX, flex: 1 }}>
                {listing.title}
              </Typography>
              <IconButton
                size="small"
                aria-label="Listing actions"
                aria-controls={
                  isActionMenuOpen ? `listing-actions-${listing.id}` : undefined
                }
                aria-haspopup="true"
                aria-expanded={isActionMenuOpen ? "true" : undefined}
                onClick={(event) => openActionMenu(event, listing)}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={
                  Boolean(statusActionLoading[listing.id]) || deleteLoading
                }
                sx={{ mt: -0.5, mr: -0.75, flexShrink: 0 }}
              >
                <MoreVert fontSize="small" />
              </IconButton>
              <Menu
                id={`listing-actions-${listing.id}`}
                anchorEl={actionMenu.anchorEl}
                open={isActionMenuOpen}
                onClose={closeActionMenu}
                onClick={(event) => event.stopPropagation()}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {listing.status !== "sold" && (
                  <MenuItem onClick={() => handleStatusUpdate(listing.id, "sold")}>
                    <CheckCircle fontSize="small" sx={{ mr: 1.25 }} />
                    Mark as Sold
                  </MenuItem>
                )}
                {listing.status !== "archived" && (
                  <MenuItem
                    onClick={() => handleStatusUpdate(listing.id, "archived")}
                  >
                    <PendingActions fontSize="small" sx={{ mr: 1.25 }} />
                    Mark Pending
                  </MenuItem>
                )}
                {(listing.status === "archived" || listing.status === "sold") && (
                  <MenuItem onClick={() => handleStatusUpdate(listing.id, "active")}>
                    <RestoreFromTrash fontSize="small" sx={{ mr: 1.25 }} />
                    Mark Available
                  </MenuItem>
                )}
                <Divider sx={{ my: 0.5 }} />
                <MenuItem
                  onClick={() => handleDeleteClick(listing)}
                  sx={{ color: "error.main" }}
                >
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
