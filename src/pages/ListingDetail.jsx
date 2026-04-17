import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Button,
  Paper,
  ImageList,
  ImageListItem,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormGroup,
  FormHelperText,
} from "@mui/material";
import {
  Edit,
  LocationOn,
  LocalShipping,
  Groups,
  Close,
  Save,
  Star,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { createConversationRequest, getExistingConversation } from "../utils/messaging";
import PaymentModal from "../components/PaymentModal";
import { fetchLocationSuggestions } from "../utils/locationSearch";
import {
  CONDITION_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  SHIPPING_PROFILE_OPTIONS,
  getConditionLabel,
  getNormalizedFulfillmentFields,
  getShippingLabel,
} from "../utils/listingUtils";
import { getUpcomingCompetitions, searchCompetitions } from "../utils/wcaApi";

function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [existingConversation, setExistingConversation] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    puzzleType: "",
    brand: "",
    meetupLocationLabel: "",
    shippingAvailable: false,
    shippingIncluded: false,
    shippingProfile: "",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
  });

  useEffect(() => {
    fetchListing();
  }, [id]);

  useEffect(() => {
    // Check for existing conversation when user and listing are loaded
    if (currentUser && listing && currentUser.uid !== listing.userId) {
      checkExistingConversation();
    }
  }, [currentUser, listing]);

  useEffect(() => {
    const query = editData.meetupLocationLabel.trim();
    if (query.length < 2) {
      setLocationOptions([]);
      setLoadingLocations(false);
      return;
    }

    let active = true;
    setLoadingLocations(true);

    const timeoutId = setTimeout(async () => {
      try {
        const suggestions = await fetchLocationSuggestions(query);
        if (active) {
          setLocationOptions(suggestions);
        }
      } catch (error) {
        console.error("Error loading location suggestions:", error);
        if (active) {
          setLocationOptions([]);
        }
      } finally {
        if (active) {
          setLoadingLocations(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [editData.meetupLocationLabel]);

  const checkExistingConversation = async () => {
    try {
      const conversation = await getExistingConversation(id, currentUser.uid);
      setExistingConversation(conversation);
    } catch (error) {
      console.error("Error checking existing conversation:", error);
    }
  };

  const fetchListing = async () => {
    try {
      const docRef = doc(db, "listings", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const listingData = { id: docSnap.id, ...docSnap.data() };
        const fulfillmentFields = getNormalizedFulfillmentFields(listingData);
        let sellerData = null;

        try {
          // Seller profile data is useful, but it should not prevent the listing
          // itself from rendering if that read is blocked or missing.
          const sellerDoc = await getDoc(doc(db, "users", listingData.userId));
          sellerData = sellerDoc.exists() ? sellerDoc.data() : null;
        } catch (sellerError) {
          console.error("Error fetching seller profile:", sellerError);
        }

        setListing({
          ...listingData,
          ...fulfillmentFields,
          stripeAccountId: sellerData?.stripeAccountId,
          sellerAvatarUrl: sellerData?.avatarUrl || "",
          sellerReviewCount: sellerData?.reviewCount || 0,
          sellerRating: sellerData?.averageRating || null,
          sellerName:
            `${sellerData?.firstName || ""} ${sellerData?.lastName || ""}`.trim() ||
            "Seller",
        });

        setEditData({
          title: listingData.title,
          price: listingData.price.toString(),
          description: listingData.description || "",
          condition: listingData.condition,
          puzzleType: listingData.puzzleType || "",
          brand: listingData.brand || "",
          meetupLocationLabel: fulfillmentFields.meetupLocationLabel,
          shippingAvailable: fulfillmentFields.shippingAvailable,
          shippingIncluded: fulfillmentFields.shippingIncluded,
          shippingProfile: fulfillmentFields.shippingProfile || "",
          localMeetupAvailable: fulfillmentFields.localMeetupAvailable,
          competitionMeetupAvailable:
            fulfillmentFields.competitionMeetupAvailable,
        });
        setSelectedCompetitions(fulfillmentFields.meetupCompetitionTags);
      } else {
        console.log("No such document!");
        setListing(null);
      }
    } catch (error) {
      console.error("Error fetching listing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    setEditMode(!editMode);
  };

  const handleInputChange = (field) => (event) => {
    setEditData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleFulfillmentChange = (field) => (event) => {
    const isChecked = event.target.checked;
    setEditData((prev) => ({
      ...prev,
      [field]: isChecked,
      ...(field === "localMeetupAvailable" && !isChecked
        ? { meetupLocationLabel: "" }
        : {}),
    }));

    if (field === "competitionMeetupAvailable" && isChecked) {
      loadCompetitions();
    }

    if (field === "competitionMeetupAvailable" && !isChecked) {
      setSelectedCompetitions([]);
      setCompetitions([]);
    }
  };

  const loadCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      const upcomingCompetitions = await getUpcomingCompetitions(500);
      setCompetitions(upcomingCompetitions);
    } catch (error) {
      console.error("Error loading competitions:", error);
      setCompetitions([]);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const handleCompetitionSearch = async (_, value) => {
    if (typeof value === "string" && value.length > 2) {
      setLoadingCompetitions(true);
      try {
        const searchResults = await searchCompetitions(value, 100);
        setCompetitions(searchResults);
      } catch (error) {
        console.error("Error searching competitions:", error);
      } finally {
        setLoadingCompetitions(false);
      }
    }
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setEditData((prev) => ({
        ...prev,
        price: value,
      }));
    }
  };

  const handleSave = async () => {
    try {
      const isDeliveryValid =
        editData.shippingAvailable ||
        editData.localMeetupAvailable ||
        editData.competitionMeetupAvailable;
      const isMeetupLocationValid =
        !editData.localMeetupAvailable ||
        Boolean(editData.meetupLocationLabel.trim());
      const isCompetitionValid =
        !editData.competitionMeetupAvailable ||
        selectedCompetitions.length > 0;
      const isShippingProfileValid =
        !editData.shippingAvailable ||
        editData.shippingIncluded ||
        Boolean(editData.shippingProfile);

      if (
        !editData.title ||
        !editData.price ||
        !editData.condition ||
        !editData.description ||
        !editData.puzzleType ||
        !isDeliveryValid ||
        !isMeetupLocationValid ||
        !isCompetitionValid ||
        !isShippingProfileValid
      ) {
        alert("Please fill in all required fields");
        return;
      }

      const docRef = doc(db, "listings", id);
      await updateDoc(docRef, {
        title: editData.title,
        price: parseFloat(editData.price),
        description: editData.description,
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        brand: editData.brand.trim(),
        location: editData.meetupLocationLabel.trim(),
        meetupLocationLabel: editData.meetupLocationLabel.trim(),
        deliveryOptions: {
          shipping: editData.shippingAvailable,
          meetup:
            editData.localMeetupAvailable ||
            editData.competitionMeetupAvailable,
        },
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingProfile: editData.shippingIncluded ? "" : editData.shippingProfile,
        shippingCost: 0,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          city: competition.city,
          country: competition.country,
          startDate: competition.startDate,
          endDate: competition.endDate,
          displayName: competition.displayName || competition.name,
          dateRange: competition.dateRange,
        })),
        meetupCompetitionTags: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          displayName: competition.displayName || competition.name,
          dateRange: competition.dateRange,
        })),
        updatedAt: new Date(),
      });

      setListing((prev) => ({
        ...prev,
        title: editData.title,
        price: parseFloat(editData.price),
        description: editData.description,
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        brand: editData.brand.trim(),
        location: editData.meetupLocationLabel.trim(),
        meetupLocationLabel: editData.meetupLocationLabel.trim(),
        deliveryOptions: {
          shipping: editData.shippingAvailable,
          meetup:
            editData.localMeetupAvailable ||
            editData.competitionMeetupAvailable,
        },
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingProfile: editData.shippingIncluded ? "" : editData.shippingProfile,
        shippingCost: 0,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions,
        meetupCompetitionTags: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          displayName: competition.displayName || competition.name,
          dateRange: competition.dateRange,
        })),
        updatedAt: new Date(),
      }));

      setEditMode(false);
      alert("Listing updated successfully!");
    } catch (error) {
      console.error("Error updating listing:", error);
      alert("Failed to update listing");
    }
  };

  const handleMessageRequest = async () => {
    if (!currentUser) {
      alert("Please sign in to message the seller");
      return;
    }

    if (currentUser.uid === listing.userId) {
      alert("You cannot message yourself");
      return;
    }

    if (!messageText.trim()) {
      alert("Please enter a message");
      return;
    }

    setSendingMessage(true);
    try {
      await createConversationRequest(
        id,
        listing.userId,
        currentUser.uid,
        messageText.trim()
      );

      setShowMessageDialog(false);
      setMessageText("");

      // Refresh conversation status
      await checkExistingConversation();

      alert("Message request sent! The seller will need to approve before you can chat.");
    } catch (error) {
      console.error("Error sending message request:", error);
      alert(error.message || "Failed to send message request");
    } finally {
      setSendingMessage(false);
    }
  };

  const openMessageDialog = () => {
    if (!currentUser) {
      alert("Please sign in to message the seller");
      return;
    }
    setShowMessageDialog(true);
  };

  const handlePurchaseClick = () => {
    if (!currentUser) {
      alert("Please sign in to make a purchase");
      return;
    }

    if (currentUser.uid === listing.userId) {
      alert("You cannot purchase your own listing");
      return;
    }

    if (listing.status === "sold") {
      alert("This item has already been sold");
      return;
    }

    if (!listing.stripeAccountId) {
      alert("This seller has not completed their payment setup. The item cannot be purchased at this time.");
      return;
    }

    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async (paymentResult, paymentIntent) => {
    try {
      // Update listing status to sold
      const docRef = doc(db, "listings", id);
      await updateDoc(docRef, {
        status: "sold",
        soldAt: new Date(),
        buyerId: currentUser.uid,
        paymentIntentId: paymentIntent.id,
      });

      // Update local state
      setListing((prev) => ({
        ...prev,
        status: "sold",
        soldAt: new Date(),
        buyerId: currentUser.uid,
      }));

      setShowPaymentModal(false);

      // Optional: Navigate to a success page or show success message
      alert("Purchase completed successfully! You will receive confirmation details shortly.");

    } catch (error) {
      console.error("Error updating listing after payment:", error);
      alert("Payment successful, but there was an issue updating the listing. Please contact support.");
    }
  };

  const handleListingStatusUpdate = async (status) => {
    try {
      setStatusActionLoading(true);
      const docRef = doc(db, "listings", id);
      const updates = {
        status,
        updatedAt: new Date(),
      };

      if (status === "sold") {
        updates.soldAt = new Date();
      }

      await updateDoc(docRef, updates);
      setListing((prev) => ({
        ...prev,
        ...updates,
      }));
    } catch (error) {
      console.error(`Error updating listing status to ${status}:`, error);
      alert("Failed to update listing status");
    } finally {
      setStatusActionLoading(false);
    }
  };

  const getMessageButtonText = () => {
    if (!existingConversation) return "Message Owner";

    switch (existingConversation.status) {
      case "pending":
        return "Request Pending";
      case "approved":
        return "Continue Chat";
      case "rejected":
        return "Request Declined";
      default:
        return "Message Owner";
    }
  };

  const isMessageButtonDisabled = () => {
    return existingConversation?.status === "pending" || existingConversation?.status === "rejected";
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  const formatDate = (date) => {
    if (!date) return "N/A";
    const dateObj = date.toDate ? date.toDate() : new Date(date);
    return dateObj.toLocaleDateString();
  };

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  if (!listing) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Listing not found</Typography>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          Back
        </Button>
      </Box>
    );
  }

  const isOwner = currentUser && currentUser.uid === listing.userId;
  const hasShipping = Boolean(listing.shippingAvailable);
  const hasMeetup = Boolean(
    listing.localMeetupAvailable || listing.competitionMeetupAvailable
  );
  const hasApprovedConversation = existingConversation?.status === "approved";
  const messageButtonText = hasMeetup
    ? hasApprovedConversation
      ? "Continue Meetup Chat"
      : "Message for Meetup"
    : getMessageButtonText();

  if (listing.status === "archived" && !isOwner) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Listing not available</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          This listing has been archived by the seller and is no longer publicly available.
        </Typography>
        <Button onClick={() => navigate("/")} sx={{ mt: 2 }} variant="outlined">
          Back to Browse
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Button onClick={() => navigate(-1)} variant="outlined">
          ← Back
        </Button>
        {isOwner ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<Edit />}
              onClick={handleEditToggle}
            >
              Edit Listing
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => handleListingStatusUpdate("sold")}
              disabled={statusActionLoading || listing.status === "sold"}
            >
              {listing.status === "sold" ? "Sold" : "Mark as Sold"}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => handleListingStatusUpdate("archived")}
              disabled={statusActionLoading || listing.status === "archived"}
            >
              {listing.status === "archived" ? "Archived" : "Archive"}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 1 }}>
            {hasShipping && (
              <Button
                variant="contained"
                color="success"
                onClick={handlePurchaseClick}
                disabled={listing.status === "sold" || listing.status === "archived"}
              >
                {listing.status === "sold" ? "Sold" : "Buy Shipped"}
              </Button>
            )}
            {(hasMeetup || !hasShipping) && (
              <Button
                variant={hasShipping ? "outlined" : "contained"}
                color={hasShipping ? "info" : "primary"}
                onClick={
                  hasApprovedConversation
                    ? () => navigate(`/messages/${existingConversation.id}`)
                    : openMessageDialog
                }
                disabled={
                  isMessageButtonDisabled() ||
                  listing.status === "sold" ||
                  listing.status === "archived"
                }
              >
                {messageButtonText}
              </Button>
            )}
            {hasShipping && !hasMeetup && (
              <Button
                variant="outlined"
                color="info"
                onClick={
                  hasApprovedConversation
                    ? () => navigate(`/messages/${existingConversation.id}`)
                    : openMessageDialog
                }
                disabled={
                  isMessageButtonDisabled() ||
                  listing.status === "sold" ||
                  listing.status === "archived"
                }
              >
                {getMessageButtonText()}
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Images Section */}
        <Grid>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Photos
            </Typography>
            {listing.photos && listing.photos.length > 0 ? (
              <ImageList variant="masonry" cols={2} gap={8}>
                {listing.photos.map((photo, index) => (
                  <ImageListItem key={index}>
                    <img
                      src={`https://wecube.s3.us-east-1.amazonaws.com/${photo.s3Key}`}
                      alt={`Listing photo ${index + 1}`}
                      loading="lazy"
                      style={{
                        borderRadius: 8,
                        width: "100%",
                        height: "auto",
                      }}
                      onError={(e) => {
                        console.error("Failed to load image:", photo.s3Key);
                        e.target.style.display = "none";
                      }}
                    />
                  </ImageListItem>
                ))}
              </ImageList>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No photos available
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Details Section */}
        <Grid>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
              {listing.title}
            </Typography>

            <Typography
              variant="h3"
              color="primary"
              fontWeight="bold"
              sx={{ mb: 2 }}
            >
              {formatPrice(listing.price)}
            </Typography>

            <Typography variant="body1" sx={{ mb: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                Condition:
              </Box>{" "}
              {getConditionLabel(listing.condition)}
            </Typography>
            {listing.puzzleType && (
              <Typography variant="body1" sx={{ mb: 0.5 }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  Puzzle Type:
                </Box>{" "}
                {listing.puzzleType}
              </Typography>
            )}
            {listing.brand && (
              <Typography variant="body1" sx={{ mb: 0.5 }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  Brand:
                </Box>{" "}
                {listing.brand}
              </Typography>
            )}
            {listing.status === "sold" && (
              <Typography variant="body2" color="text.secondary">
                Sold
              </Typography>
            )}
            {listing.status === "archived" && (
              <Typography variant="body2" color="text.secondary">
                Archived
              </Typography>
            )}
            {listing.meetupLocationLabel && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Meetup Area: {listing.meetupLocationLabel}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>
              Description
            </Typography>
            <Typography variant="body1">
              {listing.description || "No description provided."}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>
              Fulfillment
            </Typography>
            <Stack spacing={2}>
              {listing.shippingAvailable && (
                <Box>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <LocalShipping fontSize="small" />
                    Shipping
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getShippingLabel(listing, formatPrice)} with protected checkout through the app.
                  </Typography>
                </Box>
              )}
              {listing.localMeetupAvailable && (
                <Box>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <LocationOn fontSize="small" />
                    Local Meetup
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {listing.meetupLocationLabel
                      ? `Meet in ${listing.meetupLocationLabel} and coordinate details in chat.`
                      : "Coordinate a local exchange directly in chat."}
                  </Typography>
                </Box>
              )}
              {listing.competitionMeetupAvailable && (
                <Box>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <Groups fontSize="small" />
                    Competition Meetup
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Coordinate in chat and meet at one of these competitions.
                  </Typography>
                  {listing.meetupCompetitionTags?.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {listing.meetupCompetitionTags.map((competition) => (
                        <Chip
                          key={competition.id || competition.name}
                          label={competition.displayName || competition.name}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>
              Seller Details
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={listing.sellerAvatarUrl || undefined}
                sx={{ width: 56, height: 56 }}
              >
                {listing.sellerName?.charAt(0)?.toUpperCase() || "S"}
              </Avatar>
              <Box>
                <Typography variant="body1" fontWeight={600}>
                  {listing.sellerName}
                </Typography>
                {listing.sellerReviewCount > 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <Star fontSize="inherit" />
                    {listing.sellerRating
                      ? `${listing.sellerRating.toFixed(1)} · `
                      : ""}
                    {listing.sellerReviewCount} review
                    {listing.sellerReviewCount === 1 ? "" : "s"}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No reviews yet
                  </Typography>
                )}
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2" color="text.secondary">
              Listed on {formatDate(listing.createdAt)}
              {listing.updatedAt && (
                <> • Updated on {formatDate(listing.updatedAt)}</>
              )}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Edit Dialog */}
      <Dialog
        open={editMode}
        onClose={handleEditToggle}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Edit Listing
            <Button onClick={handleEditToggle}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              value={editData.title}
              onChange={handleInputChange("title")}
              required
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Price (USD)"
                  fullWidth
                  value={editData.price}
                  onChange={handlePriceChange}
                  slotProps={{
                    htmlInput: {
                      inputMode: "decimal",
                    },
                  }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Puzzle Type</InputLabel>
                  <Select
                    value={editData.puzzleType}
                    label="Puzzle Type"
                    onChange={handleInputChange("puzzleType")}
                  >
                    {PUZZLE_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Condition</InputLabel>
                  <Select
                    value={editData.condition}
                    label="Condition"
                    onChange={handleInputChange("condition")}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              label="Brand"
              fullWidth
              value={editData.brand}
              onChange={handleInputChange("brand")}
            />

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={editData.description}
              onChange={handleInputChange("description")}
            />

            <FormControl required>
              <Typography variant="subtitle1" gutterBottom>
                Fulfillment Methods
              </Typography>
              <FormGroup>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="body1">Shipping</Typography>
                  <Switch
                    checked={editData.shippingAvailable}
                    onChange={handleFulfillmentChange("shippingAvailable")}
                  />
                </Box>
                {editData.shippingAvailable && (
                  <>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography variant="body1">Shipping Included</Typography>
                      <Switch
                        checked={editData.shippingIncluded}
                        onChange={handleFulfillmentChange("shippingIncluded")}
                      />
                    </Box>
                    {!editData.shippingIncluded && (
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Shipping Type</InputLabel>
                        <Select
                          value={editData.shippingProfile}
                          label="Shipping Type"
                          onChange={(event) => {
                            setEditData((prev) => ({
                              ...prev,
                              shippingProfile: event.target.value,
                            }));
                          }}
                        >
                          {SHIPPING_PROFILE_OPTIONS.map((profile) => (
                            <MenuItem key={profile.value} value={profile.value}>
                              {profile.label} ({`$${profile.price.toFixed(2)}`})
                            </MenuItem>
                          ))}
                        </Select>
                        <FormHelperText>
                          Pick the closest package type to keep shipping pricing
                          consistent.
                        </FormHelperText>
                      </FormControl>
                    )}
                  </>
                )}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="body1">Local Meetup</Typography>
                  <Switch
                    checked={editData.localMeetupAvailable}
                    onChange={handleFulfillmentChange("localMeetupAvailable")}
                  />
                </Box>
                {editData.localMeetupAvailable && (
                  <Box sx={{ mt: 2, mb: 2 }}>
                    <Autocomplete
                      options={locationOptions}
                      freeSolo
                      value={editData.meetupLocationLabel || null}
                      inputValue={editData.meetupLocationLabel}
                      onChange={(_, newValue) => {
                        setEditData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newValue || "",
                        }));
                      }}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === "reset") {
                          return;
                        }
                        setEditData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newInputValue,
                        }));
                      }}
                      loading={loadingLocations}
                      noOptionsText={
                        editData.meetupLocationLabel.trim().length < 2
                          ? "Start typing a city..."
                          : "No matching cities found"
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="General Meetup Area"
                          placeholder="e.g., UCLA / Westwood"
                          helperText="Keep this approximate, not an exact address."
                          required
                        />
                      )}
                    />
                  </Box>
                )}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography variant="body1">Competition Meetup</Typography>
                  <Switch
                    checked={editData.competitionMeetupAvailable}
                    onChange={handleFulfillmentChange(
                      "competitionMeetupAvailable"
                    )}
                  />
                </Box>
              </FormGroup>
              {editData.competitionMeetupAvailable && (
                <Box sx={{ mt: 2 }}>
                  <Autocomplete
                    multiple
                    options={competitions}
                    getOptionLabel={(option) =>
                      option.displayName || option.name || ""
                    }
                    value={selectedCompetitions}
                    onChange={(_, newValue) => {
                      setSelectedCompetitions(newValue);
                    }}
                    onInputChange={handleCompetitionSearch}
                    loading={loadingCompetitions}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Search competitions"
                        placeholder="Type to search competitions..."
                      />
                    )}
                    renderTags={(tagValue, getTagProps) =>
                      tagValue.map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option.id || option.name}
                          label={option.displayName || option.name}
                          size="small"
                          variant="outlined"
                        />
                      ))
                    }
                  />
                </Box>
              )}
              {!editData.shippingAvailable &&
                !editData.localMeetupAvailable &&
                !editData.competitionMeetupAvailable && (
                  <FormHelperText error>
                    Please select at least one fulfillment method
                  </FormHelperText>
                )}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditToggle}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" startIcon={<Save />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Message Request Dialog */}
      <Dialog
        open={showMessageDialog}
        onClose={() => setShowMessageDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Send Message Request
            <Button onClick={() => setShowMessageDialog(false)}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Send a message to inquire about this listing. The seller will need to approve your request before you can chat.
          </Typography>
          <TextField
            autoFocus
            label="Your message"
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Hi, I'm interested in this cube. Is it still available?"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMessageDialog(false)} disabled={sendingMessage}>
            Cancel
          </Button>
          <Button
            onClick={handleMessageRequest}
            variant="contained"
            disabled={sendingMessage || !messageText.trim()}
          >
            {sendingMessage ? "Sending..." : "Send Request"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Modal */}
      {currentUser && listing && (
        <PaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          listing={listing}
          buyerInfo={currentUser}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}

export default ListingDetail;
