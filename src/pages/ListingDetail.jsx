import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Button,
  IconButton,
  Paper,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormGroup,
  FormHelperText,
  Alert,
  Collapse,
  Snackbar,
} from "@mui/material";
import {
  Edit,
  LocationOn,
  LocalShipping,
  Groups,
  ArrowBackIosNew,
  ArrowForwardIos,
  Close,
  Save,
  Star,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  createConversationRequest,
  getExistingConversation,
  getListingBuyerOptions,
  closeListingConversationsForSold,
} from "../utils/messaging";
import { subscribeToSellerReviews } from "../utils/reviews";
import ApproximateMeetupMap from "../components/ApproximateMeetupMap";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import {
  CONDITION_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  getConditionLabel,
  getNormalizedFulfillmentFields,
  getShippingLabel,
  normalizeConditionValue,
  parsePositiveCurrencyAmount,
} from "../utils/listingUtils";
import {
  DEFAULT_COMPETITION_LOAD_LIMIT,
  getUpcomingCompetitions,
  searchCompetitions,
} from "../utils/wcaApi";
import { getS3PublicUrl } from "../utils/s3";
import { SoldRibbon } from "../components/ListingStatusDecorators";

function ListingDetail() {
  const COMPETITION_BATCH_SIZE = 50;
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editNotice, setEditNotice] = useState(null);
  const [editSnackbar, setEditSnackbar] = useState(null);
  const [existingConversation, setExistingConversation] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageNotice, setMessageNotice] = useState(null);
  const [messageSnackbar, setMessageSnackbar] = useState(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [showMarkSoldDialog, setShowMarkSoldDialog] = useState(false);
  const [saleAttributionMode, setSaleAttributionMode] = useState("attributed");
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [loadingBuyerOptions, setLoadingBuyerOptions] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showAllCompetitionMeetups, setShowAllCompetitionMeetups] =
    useState(false);
  const [editData, setEditData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    puzzleType: "",
    brand: "",
    meetupLocationLabel: "",
    meetupLocation: null,
    shippingAvailable: false,
    shippingIncluded: false,
    shippingCost: "",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
  });

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onSnapshot(
      doc(db, "listings", id),
      async (docSnap) => {
        if (!docSnap.exists()) {
          if (!cancelled) {
            setListing(null);
            setLoading(false);
          }
          return;
        }

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

        if (cancelled) {
          return;
        }

        setListing({
          ...listingData,
          ...fulfillmentFields,
          sellerAvatarUrl: sellerData?.avatarUrl || "",
          sellerReviewCount: sellerData?.reviewCount || 0,
          sellerRating: sellerData?.averageRating || null,
          sellerName:
            `${sellerData?.firstName || ""} ${sellerData?.lastName || ""}`.trim() ||
            "Seller",
        });

        if (!editMode) {
          setEditData({
            title: listingData.title,
            price: listingData.price.toString(),
            description: listingData.description || "",
            condition: normalizeConditionValue(listingData.condition),
            puzzleType: listingData.puzzleType || "",
            brand: listingData.brand || "",
            meetupLocationLabel: fulfillmentFields.meetupLocationLabel,
            meetupLocation: listingData.meetupLocation || null,
            shippingAvailable: fulfillmentFields.shippingAvailable,
            shippingIncluded: fulfillmentFields.shippingIncluded,
            shippingCost:
              fulfillmentFields.shippingCost > 0
                ? fulfillmentFields.shippingCost.toString()
                : "",
            localMeetupAvailable: fulfillmentFields.localMeetupAvailable,
            competitionMeetupAvailable:
              fulfillmentFields.competitionMeetupAvailable,
          });
          setSelectedCompetitions(fulfillmentFields.meetupCompetitionTags);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to listing:", error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id, editMode]);

  useEffect(() => {
    // Check for existing conversation when user and listing are loaded
    if (currentUser && listing && currentUser.uid !== listing.userId) {
      checkExistingConversation();
    }
  }, [currentUser, listing]);

  useEffect(() => {
    if (!listing?.userId) {
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", listing.userId),
      (sellerDoc) => {
        const sellerData = sellerDoc.exists() ? sellerDoc.data() : null;
        setListing((prev) => {
          if (!prev || prev.userId !== listing.userId) {
            return prev;
          }

          return {
            ...prev,
            sellerAvatarUrl: sellerData?.avatarUrl || "",
            sellerReviewCount: sellerData?.reviewCount || 0,
            sellerRating: sellerData?.averageRating || null,
            sellerName:
              `${sellerData?.firstName || ""} ${sellerData?.lastName || ""}`.trim() ||
              "Seller",
          };
        });
      },
      (error) => {
        console.error("Error subscribing to seller profile:", error);
      }
    );

    return () => unsubscribe();
  }, [listing?.userId]);

  useEffect(() => {
    if (!listing?.userId) {
      return undefined;
    }

    const unsubscribe = subscribeToSellerReviews(
      listing.userId,
      (reviews) => {
        const reviewCount = reviews.length;
        const averageRating =
          reviewCount > 0
            ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
              reviewCount
            : null;

        setListing((prev) => {
          if (!prev || prev.userId !== listing.userId) {
            return prev;
          }

          return {
            ...prev,
            sellerReviewCount: reviewCount,
            sellerRating: averageRating,
          };
        });
      },
      (error) => {
        console.error("Error subscribing to seller reviews:", error);
      }
    );

    return () => unsubscribe();
  }, [listing?.userId]);

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
        const suggestions = await fetchLocationSuggestionOptions(query);
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

  useEffect(() => {
    setCurrentPhotoIndex(0);
    setShowFullDescription(false);
  }, [listing?.id]);

  const checkExistingConversation = async () => {
    try {
      const conversation = await getExistingConversation(id, currentUser.uid);
      setExistingConversation(conversation);
    } catch (error) {
      console.error("Error checking existing conversation:", error);
    }
  };

  const handleEditToggle = () => {
    setEditMode((prev) => !prev);
    setEditNotice(null);
  };

  const handleEditSnackbarClose = (_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setEditSnackbar(null);
  };

  const handleMessageDialogClose = () => {
    if (sendingMessage) {
      return;
    }
    setShowMessageDialog(false);
    setMessageNotice(null);
  };

  const handleMessageSnackbarClose = (_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setMessageSnackbar(null);
  };

  const handleInputChange = (field) => (event) => {
    setEditNotice(null);
    setEditData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleFulfillmentChange = (field) => (event) => {
    const isChecked = event.target.checked;
    setEditNotice(null);
    setEditData((prev) => ({
      ...prev,
      [field]: isChecked,
      ...(field === "localMeetupAvailable" && !isChecked
        ? { meetupLocationLabel: "", meetupLocation: null }
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
      const upcomingCompetitions = await getUpcomingCompetitions(
        DEFAULT_COMPETITION_LOAD_LIMIT
      );
      setAllCompetitions(upcomingCompetitions);
      setCompetitions(upcomingCompetitions.slice(0, COMPETITION_BATCH_SIZE));
    } catch (error) {
      console.error("Error loading competitions:", error);
      setCompetitions([]);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const handleCompetitionSearch = async (_, value) => {
    const normalizedValue = typeof value === "string" ? value : "";
    setCompetitionSearchInput(normalizedValue);

    if (normalizedValue.trim().length < 2) {
      setCompetitions(allCompetitions.slice(0, COMPETITION_BATCH_SIZE));
      return;
    }

    if (normalizedValue.length > 2) {
      setLoadingCompetitions(true);
      try {
        const searchResults = await searchCompetitions(normalizedValue, 100);
        setCompetitions(searchResults);
      } catch (error) {
        console.error("Error searching competitions:", error);
      } finally {
        setLoadingCompetitions(false);
      }
    }
  };

  const handleCompetitionListScroll = async (event) => {
    if (competitionSearchInput.trim().length >= 2) {
      return;
    }

    const listboxNode = event.currentTarget;
    const nearBottom =
      listboxNode.scrollTop + listboxNode.clientHeight >=
      listboxNode.scrollHeight - 24;

    if (!nearBottom) {
      return;
    }

    const nextCompetitionCount = competitions.length + COMPETITION_BATCH_SIZE;

    try {
      const nextCompetitions =
        nextCompetitionCount <= allCompetitions.length
          ? allCompetitions
          : await getUpcomingCompetitions(nextCompetitionCount);

      setAllCompetitions(nextCompetitions);
      setCompetitions(nextCompetitions.slice(0, nextCompetitionCount));
    } catch (error) {
      console.error("Error extending competition list:", error);
    }
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setEditNotice(null);
      setEditData((prev) => ({
        ...prev,
        price: value,
      }));
    }
  };

  const handleShippingCostChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setEditNotice(null);
      setEditData((prev) => ({
        ...prev,
        shippingCost: value,
      }));
    }
  };

  const resolveMeetupLocationForSave = async () => {
    if (!editData.localMeetupAvailable) {
      return null;
    }

    const label = editData.meetupLocationLabel.trim();
    if (!label) {
      return null;
    }

    if (editData.meetupLocation?.label === label) {
      return editData.meetupLocation;
    }

    try {
      const [suggestion] = await fetchLocationSuggestionOptions(label);
      return suggestion || null;
    } catch (error) {
      console.error("Error resolving meetup location:", error);
      return null;
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
      const isShippingCostValid =
        !editData.shippingAvailable ||
        editData.shippingIncluded ||
        parsePositiveCurrencyAmount(editData.shippingCost) !== null;

      if (
        !editData.title ||
        !editData.price ||
        !editData.condition ||
        !editData.description ||
        !editData.puzzleType ||
        !isDeliveryValid ||
        !isMeetupLocationValid ||
        !isCompetitionValid ||
        !isShippingCostValid
      ) {
        setEditNotice({
          severity: "warning",
          message: "Please fill in all required fields before saving.",
        });
        return;
      }

      const docRef = doc(db, "listings", id);
      const resolvedMeetupLocation = await resolveMeetupLocationForSave();
      const shippingCost =
        !editData.shippingAvailable || editData.shippingIncluded
          ? 0
          : parsePositiveCurrencyAmount(editData.shippingCost);

      await updateDoc(docRef, {
        title: editData.title,
        price: parseFloat(editData.price),
        description: editData.description,
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        brand: editData.brand.trim(),
        location: editData.meetupLocationLabel.trim(),
        meetupLocationLabel: editData.meetupLocationLabel.trim(),
        meetupLocation:
          editData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        deliveryOptions: {
          shipping: editData.shippingAvailable,
          meetup:
            editData.localMeetupAvailable ||
            editData.competitionMeetupAvailable,
        },
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingProfile: "",
        shippingCost,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          city: competition.city,
          country: competition.country,
          latitude: competition.latitude,
          longitude: competition.longitude,
          startDate: competition.startDate,
          endDate: competition.endDate,
          displayName: competition.displayName || competition.name,
          dateRange: competition.dateRange,
        })),
        meetupCompetitionTags: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          city: competition.city,
          country: competition.country,
          latitude: competition.latitude,
          longitude: competition.longitude,
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
        meetupLocation:
          editData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        deliveryOptions: {
          shipping: editData.shippingAvailable,
          meetup:
            editData.localMeetupAvailable ||
            editData.competitionMeetupAvailable,
        },
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingProfile: "",
        shippingCost,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions,
        meetupCompetitionTags: selectedCompetitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          city: competition.city,
          country: competition.country,
          latitude: competition.latitude,
          longitude: competition.longitude,
          displayName: competition.displayName || competition.name,
          dateRange: competition.dateRange,
        })),
        updatedAt: new Date(),
      }));

      setEditMode(false);
      setEditNotice(null);
      setEditSnackbar({
        severity: "success",
        message: "Listing updated successfully.",
      });
    } catch (error) {
      console.error("Error updating listing:", error);
      setEditSnackbar({
        severity: "error",
        message: "Failed to update listing. Please try again.",
      });
    }
  };

  const handleMessageRequest = async () => {
    if (!currentUser) {
      setMessageNotice({
        severity: "info",
        message: "Please sign in to message the seller.",
      });
      return;
    }

    if (currentUser.uid === listing.userId) {
      setMessageNotice({
        severity: "warning",
        message: "You cannot message yourself.",
      });
      return;
    }

    if (!messageText.trim()) {
      setMessageNotice({
        severity: "warning",
        message: "Please enter a message before sending.",
      });
      return;
    }

    setMessageNotice(null);
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
      setMessageNotice(null);

      // Refresh conversation status
      await checkExistingConversation();

      setMessageSnackbar({
        severity: "success",
        message: "Message request sent. The seller will need to approve it before you can chat.",
      });
    } catch (error) {
      console.error("Error sending message request:", error);
      setMessageSnackbar({
        severity: "error",
        message: error.message || "Failed to send message request.",
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const openMessageDialog = () => {
    if (!currentUser) {
      setMessageSnackbar({
        severity: "info",
        message: "Please sign in to message the seller.",
      });
      return;
    }
    setMessageNotice(null);
    setShowMessageDialog(true);
  };

  const openMarkSoldDialog = async () => {
    setShowMarkSoldDialog(true);
    setLoadingBuyerOptions(true);

    try {
      const options = await getListingBuyerOptions(id, listing.userId);
      setBuyerOptions(options);

      if (options.length > 0) {
        setSaleAttributionMode("attributed");
        if (options.length === 1) {
          setSelectedBuyerId(options[0].buyerId);
        }
      } else {
        setSaleAttributionMode("off_app");
        setSelectedBuyerId("");
      }
    } catch (error) {
      console.error("Error loading buyer options for sale attribution:", error);
      setBuyerOptions([]);
      setSaleAttributionMode("off_app");
    } finally {
      setLoadingBuyerOptions(false);
    }
  };

  const closeMarkSoldDialog = () => {
    if (statusActionLoading) return;
    setShowMarkSoldDialog(false);
    setSaleAttributionMode("attributed");
    setBuyerOptions([]);
    setLoadingBuyerOptions(false);
    setSelectedBuyerId("");
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

  const handleConfirmMarkSold = async () => {
    if (saleAttributionMode === "attributed" && !selectedBuyerId) {
      alert("Select the buyer who completed the sale, or choose sold off app.");
      return;
    }

    try {
      setStatusActionLoading(true);
      const now = new Date();
      const selectedBuyer = buyerOptions.find((option) => option.buyerId === selectedBuyerId);
      const sellerFirstName =
        listing?.sellerName?.trim()?.split(/\s+/)?.[0] || "Seller";
      const updates = {
        status: "sold",
        soldAt: now,
        updatedAt: now,
        soldMethod:
          saleAttributionMode === "attributed"
            ? "meetup_in_app"
            : "meetup_off_app",
        buyerId: saleAttributionMode === "attributed" ? selectedBuyerId : null,
        soldConversationId:
          saleAttributionMode === "attributed"
            ? selectedBuyer?.conversationId || null
            : null,
      };

      await updateDoc(doc(db, "listings", id), updates);
      await closeListingConversationsForSold(
        id,
        listing.userId,
        sellerFirstName,
        listing.title
      );
      setListing((prev) => ({
        ...prev,
        ...updates,
      }));
      closeMarkSoldDialog();
    } catch (error) {
      console.error("Error marking listing as sold:", error);
      alert("Failed to update listing status");
    } finally {
      setStatusActionLoading(false);
    }
  };

  const getMessageButtonText = () => {
    if (!existingConversation) return "Message";

    switch (existingConversation.status) {
      case "pending":
        return "Request Pending";
      case "approved":
        return "Continue Chat";
      case "rejected":
        return "Request Declined";
      default:
        return "Message";
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

  const photoCount = listing?.photos?.length || 0;
  const activePhoto = photoCount > 0 ? listing.photos[currentPhotoIndex] : null;
  const descriptionText = listing?.description || "No description provided.";
  const shouldCollapseDescription = descriptionText.length > 280;
  const meetupCompetitionTags = listing?.meetupCompetitionTags || [];
  const visibleCompetitionMeetups = showAllCompetitionMeetups
    ? meetupCompetitionTags
    : meetupCompetitionTags.slice(0, 3);
  const hiddenCompetitionMeetupCount = Math.max(
    meetupCompetitionTags.length - visibleCompetitionMeetups.length,
    0
  );

  const handlePreviousPhoto = () => {
    if (photoCount <= 1) return;
    setCurrentPhotoIndex((prev) => (prev === 0 ? photoCount - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    if (photoCount <= 1) return;
    setCurrentPhotoIndex((prev) => (prev === photoCount - 1 ? 0 : prev + 1));
  };

  const handleViewCompetitionListings = (competition) => {
    navigate(`/competitions/${competition.id}/listings`, {
      state: {
        competition,
        returnTo: `/listing/${id}`,
        returnLabel: listing.title,
      },
    });
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
  const hasApprovedConversation = existingConversation?.status === "approved";
  const cameFromPublish = Boolean(location.state?.fromPublish);
  const isListingUnavailable =
    listing.status === "sold" || listing.status === "archived";
  const primaryActionText = hasApprovedConversation
    ? "Continue Chat"
    : "Send Message";
  const primaryActionHelperText = listing.shippingAvailable
    ? "Shipping is arranged directly with the seller. Message them to confirm payment, shipping cost, and tracking."
    : "Message the seller to coordinate pickup.";
  const handleMessageAction = hasApprovedConversation
    ? () => navigate(`/messages/${existingConversation.id}`)
    : openMessageDialog;

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
        <Button
          onClick={() => (cameFromPublish ? navigate("/") : navigate(-1))}
          variant="outlined"
        >
          {cameFromPublish ? "← Home" : "← Back"}
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
              onClick={openMarkSoldDialog}
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
            <Button
              variant="outlined"
              color="info"
              onClick={handleMessageAction}
              disabled={isMessageButtonDisabled() || isListingUnavailable}
            >
              {getMessageButtonText()}
            </Button>
          </Box>
        )}
      </Box>

      <Grid container spacing={3} alignItems="flex-start">
        {/* Images Section */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2, position: { lg: "sticky" }, top: { lg: 24 } }}>
            <Typography variant="h6" gutterBottom>
              Photos
            </Typography>
            {activePhoto ? (
              <Stack spacing={2}>
                <Box
                  sx={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 2,
                    overflow: "hidden",
                    backgroundColor: "grey.100",
                  }}
                >
                  {listing.status === "sold" && <SoldRibbon size="large" />}
                  <Box
                    component="img"
                    src={getS3PublicUrl(activePhoto.s3Key)}
                    alt={`Listing photo ${currentPhotoIndex + 1}`}
                    sx={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                    onError={(e) => {
                      console.error("Failed to load image:", activePhoto.s3Key);
                      e.target.style.display = "none";
                    }}
                  />

                  {photoCount > 1 && (
                    <>
                      <IconButton
                        onClick={handlePreviousPhoto}
                        sx={{
                          position: "absolute",
                          left: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          backgroundColor: "rgba(255,255,255,0.92)",
                          "&:hover": {
                            backgroundColor: "rgba(255,255,255,1)",
                          },
                        }}
                      >
                        <ArrowBackIosNew fontSize="small" />
                      </IconButton>
                      <IconButton
                        onClick={handleNextPhoto}
                        sx={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          backgroundColor: "rgba(255,255,255,0.92)",
                          "&:hover": {
                            backgroundColor: "rgba(255,255,255,1)",
                          },
                        }}
                      >
                        <ArrowForwardIos fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>

                {photoCount > 1 && (
                  <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
                    {listing.photos.map((photo, index) => (
                      <Box
                        key={photo.s3Key || index}
                        onClick={() => setCurrentPhotoIndex(index)}
                        sx={{
                          width: 84,
                          minWidth: 84,
                          aspectRatio: "1 / 1",
                          borderRadius: 1.5,
                          overflow: "hidden",
                          border: "2px solid",
                          borderColor:
                            index === currentPhotoIndex ? "primary.main" : "divider",
                          cursor: "pointer",
                          backgroundColor: "grey.100",
                        }}
                      >
                        <Box
                          component="img"
                          src={getS3PublicUrl(photo.s3Key)}
                          alt={`Thumbnail ${index + 1}`}
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}

                {photoCount > 1 && (
                  <Typography variant="body2" color="text.secondary">
                    {currentPhotoIndex + 1} of {photoCount}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No photos available
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Details Section */}
        <Grid size={{ xs: 12, lg: 6 }}>
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

            {!isOwner && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  mb: 2.5,
                  borderColor: "divider",
                  bgcolor: "background.default",
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    {primaryActionHelperText}
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    onClick={handleMessageAction}
                    disabled={isListingUnavailable || isMessageButtonDisabled()}
                  >
                    {listing.status === "sold" ? "Sold" : primaryActionText}
                  </Button>
                </Stack>
              </Paper>
            )}

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
            <Typography
              variant="body1"
              sx={
                shouldCollapseDescription && !showFullDescription
                  ? {
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 4,
                      overflow: "hidden",
                    }
                  : undefined
              }
            >
              {descriptionText}
            </Typography>
            {shouldCollapseDescription && (
              <Button
                variant="text"
                sx={{ mt: 1, px: 0, alignSelf: "flex-start" }}
                onClick={() => setShowFullDescription((prev) => !prev)}
              >
                {showFullDescription ? "Show less" : "See more"}
              </Button>
            )}

            <Divider sx={{ my: 2 }} />

            <Stack spacing={2.5}>
              {listing.localMeetupAvailable && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Local Meetup
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <LocationOn fontSize="small" />
                    {listing.meetupLocationLabel || "Meetup area"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Coordinate the exact meeting spot and time with the seller
                    in chat.
                  </Typography>
                  <ApproximateMeetupMap
                    location={listing.meetupLocation}
                    label={listing.meetupLocationLabel}
                  />
                </Box>
              )}

              {listing.competitionMeetupAvailable && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Competition Meetup
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <Groups fontSize="small" />
                    Available at selected competitions
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Message the seller to coordinate where and when to meet at
                    the competition.
                  </Typography>
                  {meetupCompetitionTags.length > 0 && (
                    <Stack spacing={1.25}>
                      {visibleCompetitionMeetups.map((competition) => (
                        <Paper
                          key={competition.id || competition.name}
                          variant="outlined"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleViewCompetitionListings(competition)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleViewCompetitionListings(competition);
                            }
                          }}
                          sx={{
                            p: 1.5,
                            cursor: "pointer",
                            borderRadius: 2,
                            bgcolor: "background.default",
                            transition:
                              "background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s",
                            "&:hover": {
                              borderColor: "primary.main",
                              bgcolor: "primary.50",
                              boxShadow: 2,
                              transform: "translateY(-1px)",
                            },
                            "&:focus-visible": {
                              outline: "2px solid",
                              outlineColor: "primary.main",
                              outlineOffset: 2,
                            },
                          }}
                        >
                          <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                          >
                            <Box
                              sx={{
                                width: 42,
                                height: 42,
                                borderRadius: "50%",
                                bgcolor: "primary.50",
                                color: "primary.main",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Groups fontSize="small" />
                            </Box>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography
                                variant="body1"
                                fontWeight={700}
                                sx={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {competition.name}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {[competition.city, competition.country]
                                  .filter(Boolean)
                                  .join(", ")}
                              </Typography>
                              {competition.dateRange && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  {competition.dateRange}
                                </Typography>
                              )}
                              <Typography
                                variant="caption"
                                color="primary"
                                sx={{
                                  display: "block",
                                  fontWeight: 700,
                                  mt: 0.25,
                                }}
                              >
                                View competition listings
                              </Typography>
                            </Box>
                          </Stack>
                        </Paper>
                      ))}
                      {meetupCompetitionTags.length > 3 && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() =>
                            setShowAllCompetitionMeetups((prev) => !prev)
                          }
                          sx={{ alignSelf: "flex-start", px: 0 }}
                        >
                          {showAllCompetitionMeetups
                            ? "Show fewer competitions"
                            : `Show ${hiddenCompetitionMeetupCount} more ${
                                hiddenCompetitionMeetupCount === 1
                                  ? "competition"
                                  : "competitions"
                              }`}
                        </Button>
                      )}
                    </Stack>
                  )}
                </Box>
              )}

              {listing.shippingAvailable && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Shipping & Returns
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}
                  >
                    <LocalShipping fontSize="small" />
                    {getShippingLabel(listing, formatPrice)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Shipping and payment are arranged directly with the seller.
                    Use tracked shipping and buyer-protected payment methods.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No returns for this item.
                  </Typography>
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
              <Box sx={{ ml: "auto" }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate(`/seller/${listing.userId}`)}
                >
                  View Seller
                </Button>
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
        open={showMarkSoldDialog}
        onClose={closeMarkSoldDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mark Listing as Sold</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              For meetup or in-person deals, choose the buyer who completed the sale so reviews can be tied to the right transaction.
            </Typography>

            <RadioGroup
              value={saleAttributionMode}
              onChange={(event) => setSaleAttributionMode(event.target.value)}
            >
              <FormControlLabel
                value="attributed"
                control={<Radio />}
                disabled={loadingBuyerOptions || buyerOptions.length === 0}
                label="Sold to a buyer from WeCube messages"
              />
              <FormControlLabel
                value="off_app"
                control={<Radio />}
                label="Sold off app or without a matched buyer"
              />
            </RadioGroup>

            {loadingBuyerOptions ? (
              <Typography variant="body2" color="text.secondary">
                Loading buyer conversations...
              </Typography>
            ) : saleAttributionMode === "attributed" ? (
              buyerOptions.length > 0 ? (
                <FormControl fullWidth>
                  <InputLabel>Completed Buyer</InputLabel>
                  <Select
                    value={selectedBuyerId}
                    label="Completed Buyer"
                    onChange={(event) => setSelectedBuyerId(event.target.value)}
                  >
                    {buyerOptions.map((option) => (
                      <MenuItem key={option.conversationId} value={option.buyerId}>
                        {option.buyerName} {option.status === "approved" ? "• approved chat" : "• pending request"}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Only sales attributed to a buyer in-app will unlock buyer reviews.
                  </FormHelperText>
                </FormControl>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No eligible buyer conversations were found for this listing. Mark it as sold off app if the sale happened outside WeCube.
                </Typography>
              )
            ) : (
              <Typography variant="body2" color="text.secondary">
                This will mark the listing as sold without linking it to a buyer, so no buyer review will unlock from this sale.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMarkSoldDialog} color="inherit" disabled={statusActionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmMarkSold}
            variant="contained"
            color="warning"
            disabled={
              statusActionLoading ||
              loadingBuyerOptions ||
              (saleAttributionMode === "attributed" &&
                buyerOptions.length > 0 &&
                !selectedBuyerId)
            }
          >
            {saleAttributionMode === "attributed" ? "Mark Sold to Buyer" : "Mark Sold Off App"}
          </Button>
        </DialogActions>
      </Dialog>

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
            <Collapse in={Boolean(editNotice)}>
              {editNotice && (
                <Alert
                  severity={editNotice.severity}
                  variant="outlined"
                  sx={{ alignItems: "center" }}
                >
                  {editNotice.message}
                </Alert>
              )}
            </Collapse>

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
                      <TextField
                        label="Shipping Price (USD)"
                        fullWidth
                        placeholder="e.g., 8.00"
                        value={editData.shippingCost}
                        onChange={handleShippingCostChange}
                        helperText="Set a shipping price greater than $0 that buyers should expect to pay you directly."
                        slotProps={{
                          htmlInput: {
                            inputMode: "decimal",
                          },
                        }}
                        required
                        sx={{ mb: 2 }}
                      />
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
                      getOptionLabel={getLocationOptionLabel}
                      onChange={(_, newValue) => {
                        const selectedLocation =
                          typeof newValue === "string" ? null : newValue;
                        setEditNotice(null);
                        setEditData((prev) => ({
                          ...prev,
                          meetupLocationLabel: getLocationOptionLabel(newValue),
                          meetupLocation: selectedLocation,
                        }));
                      }}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === "reset") {
                          return;
                        }
                        setEditNotice(null);
                        setEditData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newInputValue,
                          meetupLocation:
                            newInputValue === prev.meetupLocation?.label
                              ? prev.meetupLocation
                              : null,
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
                    inputValue={competitionSearchInput}
                    getOptionLabel={(option) =>
                      option.displayName || option.name || ""
                    }
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    value={selectedCompetitions}
                    onChange={(_, newValue) => {
                      setEditNotice(null);
                      setSelectedCompetitions(newValue);
                    }}
                    onInputChange={handleCompetitionSearch}
                    ListboxProps={{
                      onScroll: handleCompetitionListScroll,
                    }}
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

      <Snackbar
        open={Boolean(editSnackbar)}
        autoHideDuration={3200}
        onClose={handleEditSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {editSnackbar && (
          <Alert
            onClose={handleEditSnackbarClose}
            severity={editSnackbar.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {editSnackbar.message}
          </Alert>
        )}
      </Snackbar>

      <Snackbar
        open={Boolean(messageSnackbar)}
        autoHideDuration={3600}
        onClose={handleMessageSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {messageSnackbar && (
          <Alert
            onClose={handleMessageSnackbarClose}
            severity={messageSnackbar.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {messageSnackbar.message}
          </Alert>
        )}
      </Snackbar>

      {/* Message Request Dialog */}
      <Dialog
        open={showMessageDialog}
        onClose={handleMessageDialogClose}
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
            <Button onClick={handleMessageDialogClose} disabled={sendingMessage}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Send a message to inquire about this listing. The seller will need to approve your request before you can chat.
          </Typography>
          <Collapse in={Boolean(messageNotice)}>
            {messageNotice && (
              <Alert
                severity={messageNotice.severity}
                variant="outlined"
                sx={{ alignItems: "center", mb: 2 }}
              >
                {messageNotice.message}
              </Alert>
            )}
          </Collapse>
          <TextField
            autoFocus
            label="Your message"
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => {
              setMessageNotice(null);
              setMessageText(e.target.value);
            }}
            placeholder="Hi, I'm interested in this cube. Is it still available?"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleMessageDialogClose} disabled={sendingMessage}>
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

    </Box>
  );
}

export default ListingDetail;
