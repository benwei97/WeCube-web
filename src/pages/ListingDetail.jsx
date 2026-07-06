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
  DialogContentText,
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
  Alert,
  Collapse,
  Snackbar,
  Menu,
  Radio,
  InputAdornment,
} from "@mui/material";
import {
  CheckCircle,
  Delete,
  Edit,
  LocationOn,
  LocalShipping,
  Groups,
  ArrowBackIosNew,
  ArrowForwardIos,
  Close,
  MoreVert,
  PendingActions,
  Restore,
  Save,
  Star,
  PlayCircleOutline,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { deleteDoc, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  createConversation,
  getExistingConversation,
  getListingBuyerOptions,
  closeListingConversationsForSold,
  cancelListingReviewPrompts,
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
  formatListingPrice,
  getConditionLabel,
  formatListedLocationLabel,
  getListingCompetitionPayload,
  getNormalizedFulfillmentFields,
  getShippingPriceFromListing,
  normalizeConditionValue,
  parseNonNegativeCurrencyAmount,
  parsePositiveCurrencyAmount,
} from "../utils/listingUtils";
import {
  DEFAULT_COMPETITION_LOAD_LIMIT,
  getUpcomingCompetitions,
  searchCompetitions,
} from "../utils/wcaApi";
import { deleteMultipleImages, getS3PublicUrl } from "../utils/s3";
import { PendingBadge, SoldRibbon } from "../components/ListingStatusDecorators";
import {
  characterCountText,
  clampText,
  formatCurrencyInputFromDigits,
  INPUT_LIMITS,
} from "../utils/inputLimits";

const BACK_BUTTON_SX = {
  color: "text.primary",
  borderColor: "rgba(148, 163, 184, 0.22)",
  "&:hover": {
    borderColor: "primary.main",
    bgcolor: "rgba(100, 108, 255, 0.04)",
  },
};

function FulfillmentInfoTitle({ children }) {
  return (
    <Typography
      variant="subtitle2"
      sx={{
        display: "flex",
        alignItems: "center",
        mb: 0.55,
        fontWeight: 600,
      }}
    >
      {children}
    </Typography>
  );
}

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
  const [hasAttemptedEditSave, setHasAttemptedEditSave] = useState(false);
  const [editSnackbar, setEditSnackbar] = useState(null);
  const [existingConversation, setExistingConversation] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageNotice, setMessageNotice] = useState(null);
  const [messageSnackbar, setMessageSnackbar] = useState(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [ownerMenuAnchorEl, setOwnerMenuAnchorEl] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [statusConfirmDialog, setStatusConfirmDialog] = useState({
    open: false,
    status: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showMarkSoldDialog, setShowMarkSoldDialog] = useState(false);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [soldMethodChoice, setSoldMethodChoice] = useState("in_app");
  const [selectedBuyerConversationId, setSelectedBuyerConversationId] =
    useState("");
  const [loadingBuyerOptions, setLoadingBuyerOptions] = useState(false);
  const [openedMarkSoldFromRoute, setOpenedMarkSoldFromRoute] =
    useState(false);
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
    if (!location.state?.publishSuccess) {
      return;
    }

    setMessageSnackbar({
      severity: "success",
      message: "Your listing has been posted.",
    });
    navigate(location.pathname, {
      replace: true,
      state: { fromPublish: Boolean(location.state?.fromPublish) },
    });
  }, [location.pathname, location.state, navigate]);

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
    setHasAttemptedEditSave(false);
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
    const fieldLimits = {
      title: INPUT_LIMITS.LISTING_TITLE,
      description: INPUT_LIMITS.LISTING_DESCRIPTION,
    };
    const limit = fieldLimits[field];
    const value = limit
      ? clampText(event.target.value, limit)
      : event.target.value;

    setEditNotice(null);
    setEditData((prev) => ({
      ...prev,
      [field]: value,
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
    const value = formatCurrencyInputFromDigits(
      event.target.value,
      INPUT_LIMITS.LISTING_PRICE_MAX
    );

    if (value === null) {
      return;
    }

    setEditNotice(null);
    setEditData((prev) => ({
      ...prev,
      price: value,
    }));
  };

  const handleShippingCostChange = (event) => {
    const value = formatCurrencyInputFromDigits(
      event.target.value,
      INPUT_LIMITS.SHIPPING_COST_MAX
    );

    if (value === null) {
      return;
    }

    setEditNotice(null);
    setEditData((prev) => ({
      ...prev,
      shippingCost: value,
    }));
  };

  const resolveMeetupLocationForSave = async () => {
    if (!editData.localMeetupAvailable) {
      return null;
    }

    if (editData.meetupLocation?.label === editData.meetupLocationLabel.trim()) {
      return editData.meetupLocation;
    }
    return null;
  };

  const isEditDeliveryValid =
    editData.shippingAvailable ||
    editData.localMeetupAvailable ||
    editData.competitionMeetupAvailable;
  const isEditMeetupLocationValid =
    !editData.localMeetupAvailable ||
    (Boolean(editData.meetupLocationLabel.trim()) &&
      editData.meetupLocation?.label === editData.meetupLocationLabel.trim());
  const isEditCompetitionValid =
    !editData.competitionMeetupAvailable ||
    selectedCompetitions.length > 0;
  const isEditShippingCostValid =
    !editData.shippingAvailable ||
    editData.shippingIncluded ||
    (parsePositiveCurrencyAmount(editData.shippingCost) !== null &&
      parsePositiveCurrencyAmount(editData.shippingCost) <=
        INPUT_LIMITS.SHIPPING_COST_MAX);
  const isEditTitleInvalid = hasAttemptedEditSave && !editData.title.trim();
  const isEditPriceInvalid =
    hasAttemptedEditSave &&
    (!editData.price ||
      parseNonNegativeCurrencyAmount(editData.price) === null ||
      parseNonNegativeCurrencyAmount(editData.price) >
        INPUT_LIMITS.LISTING_PRICE_MAX);
  const isEditPuzzleTypeInvalid =
    hasAttemptedEditSave && !editData.puzzleType;
  const isEditConditionInvalid = hasAttemptedEditSave && !editData.condition;
  const isEditDescriptionInvalid =
    hasAttemptedEditSave && !editData.description.trim();

  const handleSave = async () => {
    setHasAttemptedEditSave(true);

    try {
      if (
        !editData.title.trim() ||
        parseNonNegativeCurrencyAmount(editData.price) === null ||
        parseNonNegativeCurrencyAmount(editData.price) >
          INPUT_LIMITS.LISTING_PRICE_MAX ||
        !editData.condition ||
        !editData.description.trim() ||
        !editData.puzzleType ||
        !isEditDeliveryValid ||
        !isEditMeetupLocationValid ||
        !isEditCompetitionValid ||
        !isEditShippingCostValid
      ) {
        setEditNotice({
          severity: "error",
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
        title: editData.title.trim(),
        price: parseNonNegativeCurrencyAmount(editData.price),
        description: editData.description.trim(),
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        meetupLocationLabel: editData.meetupLocationLabel.trim(),
        meetupLocation:
          editData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingCost,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition, { includeSchedule: true })
        ),
        meetupCompetitionTags: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition)
        ),
        updatedAt: new Date(),
      });

      setListing((prev) => ({
        ...prev,
        title: editData.title,
        price: parseNonNegativeCurrencyAmount(editData.price),
        description: editData.description,
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        meetupLocationLabel: editData.meetupLocationLabel.trim(),
        meetupLocation:
          editData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingIncluded,
        shippingCost,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition, { includeSchedule: true })
        ),
        meetupCompetitionTags: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition)
        ),
        updatedAt: new Date(),
      }));

      setEditMode(false);
      setEditNotice(null);
      setHasAttemptedEditSave(false);
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
        severity: "error",
        message: "You cannot message yourself.",
      });
      return;
    }

    if (!messageText.trim()) {
      setMessageNotice({
        severity: "error",
        message: "Please enter a message before sending.",
      });
      return;
    }

    if (messageText.length > INPUT_LIMITS.MESSAGE_TEXT) {
      setMessageNotice({
        severity: "error",
        message: `Keep your message under ${INPUT_LIMITS.MESSAGE_TEXT.toLocaleString()} characters.`,
      });
      return;
    }

    setMessageNotice(null);
    setSendingMessage(true);
    try {
      const conversationId = await createConversation(
        id,
        listing.userId,
        currentUser.uid,
        messageText.trim()
      );

      setShowMessageDialog(false);
      setMessageText("");
      setMessageNotice(null);

      await checkExistingConversation();
      navigate(`/messages/${conversationId}`);

      setMessageSnackbar({
        severity: "success",
        message: "Message sent.",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setMessageSnackbar({
        severity: "error",
        message: "Unable to send your message right now. Please try again.",
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
    closeOwnerMenu();
    setShowMarkSoldDialog(true);
    setLoadingBuyerOptions(true);
    setSoldMethodChoice("in_app");
    setSelectedBuyerConversationId("");

    try {
      const options = await getListingBuyerOptions(id, listing.userId);
      setBuyerOptions(options);
      if (options.length === 1) {
        setSelectedBuyerConversationId(options[0].conversationId);
      }
    } catch (error) {
      console.error("Error loading buyer options:", error);
      setBuyerOptions([]);
      setMessageSnackbar({
        severity: "error",
        message: "Failed to load buyer conversations.",
      });
    } finally {
      setLoadingBuyerOptions(false);
    }
  };

  const closeMarkSoldDialog = () => {
    if (statusActionLoading) return;
    setShowMarkSoldDialog(false);
    setSoldMethodChoice("in_app");
    setSelectedBuyerConversationId("");
  };

  useEffect(() => {
    if (
      !location.state?.openMarkSoldDialog ||
      openedMarkSoldFromRoute ||
      !listing ||
      !currentUser ||
      currentUser.uid !== listing.userId ||
      showMarkSoldDialog
    ) {
      return;
    }

    setOpenedMarkSoldFromRoute(true);
    openMarkSoldDialog();
    navigate(location.pathname, {
      replace: true,
      state: { ...location.state, openMarkSoldDialog: false },
    });
  }, [
    location.state,
    openedMarkSoldFromRoute,
    listing,
    currentUser,
    showMarkSoldDialog,
  ]);

  const closeOwnerMenu = () => {
    setOwnerMenuAnchorEl(null);
  };

  const handleListingStatusUpdate = async (status) => {
    try {
      closeOwnerMenu();
      setStatusActionLoading(true);
      const now = new Date();
      const docRef = doc(db, "listings", id);
      const updates = {
        status,
        updatedAt: now,
      };

      if (status === "sold") {
        updates.soldAt = now;
        updates.archivedAt = null;
      }

      if (status === "archived") {
        updates.archivedAt = now;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
        updates.saleEventId = null;
      }

      if (status === "active") {
        updates.archivedAt = null;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
        updates.saleEventId = null;
      }

      await updateDoc(docRef, updates);
      if (listing.status === "sold" && status !== "sold") {
        const sellerFirstName =
          listing?.sellerName?.trim()?.split(/\s+/)?.[0] || "Seller";
        await cancelListingReviewPrompts(
          id,
          listing.userId,
          sellerFirstName,
          listing.title
        );
      }
      setListing((prev) => ({
        ...prev,
        ...updates,
      }));
      setMessageSnackbar({
        severity: "success",
        message:
          status === "active"
            ? "Listing is available again."
            : status === "archived"
              ? "Listing marked as pending."
              : "Listing marked as sold.",
      });
    } catch (error) {
      console.error(`Error updating listing status to ${status}:`, error);
      setMessageSnackbar({
        severity: "error",
        message: "Failed to update listing status.",
      });
    } finally {
      setStatusActionLoading(false);
    }
  };

  const openStatusConfirmDialog = (status) => {
    closeOwnerMenu();
    setStatusConfirmDialog({ open: true, status });
  };

  const closeStatusConfirmDialog = () => {
    if (statusActionLoading) return;
    setStatusConfirmDialog({ open: false, status: null });
  };

  const handleConfirmStatusUpdate = async () => {
    if (!statusConfirmDialog.status) return;

    await handleListingStatusUpdate(statusConfirmDialog.status);
    setStatusConfirmDialog({ open: false, status: null });
  };

  const handleConfirmMarkSold = async () => {
    try {
      const soldInApp = soldMethodChoice === "in_app";
      const selectedBuyer =
        soldInApp
          ? buyerOptions.find(
              (option) => option.conversationId === selectedBuyerConversationId
            ) || null
          : null;

      if (soldInApp && !selectedBuyer) {
        setMessageSnackbar({
          severity: "error",
          message: "Select the buyer who completed the sale, or choose sold off app.",
        });
        return;
      }

      setStatusActionLoading(true);
      const now = new Date();
      const saleEventId = `${id}_${now.getTime()}`;
      const sellerFirstName =
        listing?.sellerName?.trim()?.split(/\s+/)?.[0] || "Seller";
      const updates = {
        status: "sold",
        soldAt: now,
        archivedAt: null,
        updatedAt: now,
        soldMethod: soldInApp ? "buyer_selected" : "sold_off_app",
        saleEventId,
        buyerId: selectedBuyer?.buyerId || null,
        soldConversationId: selectedBuyer?.conversationId || null,
      };

      await updateDoc(doc(db, "listings", id), updates);
      let reviewPromptSent = false;
      try {
        await closeListingConversationsForSold(
          id,
          listing.userId,
          sellerFirstName,
          listing.title,
          saleEventId,
          selectedBuyer?.conversationId || null
        );
        if (selectedBuyer) {
          reviewPromptSent = true;
        }
      } catch (promptError) {
        console.error("Error sending sold conversation updates:", promptError);
      }
      setListing((prev) => ({
        ...prev,
        ...updates,
      }));
      closeMarkSoldDialog();
      setMessageSnackbar({
        severity: selectedBuyer && !reviewPromptSent ? "warning" : "success",
        message: selectedBuyer
          ? reviewPromptSent
            ? "Listing marked as sold. A review request was sent in that chat."
            : "Listing marked as sold, but the review request could not be sent."
          : "Listing marked as sold off app.",
      });
    } catch (error) {
      console.error("Error marking listing as sold:", error);
      setMessageSnackbar({
        severity: "error",
        message: "Failed to update listing status.",
      });
    } finally {
      setStatusActionLoading(false);
    }
  };

  const openDeleteDialog = () => {
    closeOwnerMenu();
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    if (deleteLoading) return;
    setShowDeleteDialog(false);
  };

  const handleDeleteListing = async () => {
    if (!listing) return;

    setDeleteLoading(true);
    try {
      const s3Keys = [
        ...(listing.photos || []).map((photo) => photo.s3Key),
        listing.video?.s3Key,
      ].filter(Boolean);

      if (s3Keys.length > 0) {
        await deleteMultipleImages(s3Keys);
      }

      await deleteDoc(doc(db, "listings", id));
      setShowDeleteDialog(false);
      navigate("/");
    } catch (error) {
      console.error("Error deleting listing:", error);
      setMessageSnackbar({
        severity: "error",
        message: `Failed to delete listing: ${error.message}`,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const getMessageButtonText = () => {
    if (listing?.status === "archived") return "Pending";
    if (listing?.status === "sold") return "Sold";
    if (!existingConversation) return "Message";

    switch (existingConversation.status) {
      case "approved":
      case "pending":
        return "Continue Chat";
      case "rejected":
        return "Message Unavailable";
      default:
        return "Message";
    }
  };

  const isMessageButtonDisabled = () => {
    return existingConversation?.status === "rejected";
  };

  const formatPrice = formatListingPrice;

  const formatShippingDetail = (listingData) => {
    if (listingData.shippingIncluded) {
      return "Free shipping";
    }

    const shippingPrice = getShippingPriceFromListing(listingData);
    return shippingPrice > 0
      ? `+${formatPrice(shippingPrice)} shipping fee`
      : "Free shipping";
  };

  const formatShippingPriceNote = (listingData) => {
    if (!listingData?.shippingAvailable) {
      return null;
    }

    if (listingData.shippingIncluded) {
      return "Free shipping";
    }

    const shippingPrice = getShippingPriceFromListing(listingData);
    return shippingPrice > 0
      ? `+ ${formatPrice(shippingPrice)} shipping`
      : "Free shipping";
  };

  const formatDate = (date) => {
    if (!date) return "N/A";
    const dateObj = date.toDate ? date.toDate() : new Date(date);
    return dateObj.toLocaleDateString();
  };

  const mediaItems = [
    ...(listing?.photos || []).map((photo) => ({ ...photo, mediaType: "photo" })),
    ...(listing?.video ? [{ ...listing.video, mediaType: "video" }] : []),
  ];
  const mediaCount = mediaItems.length;
  const activeMedia = mediaCount > 0 ? mediaItems[currentPhotoIndex] : null;
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
    if (mediaCount <= 1) return;
    setCurrentPhotoIndex((prev) => (prev === 0 ? mediaCount - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    if (mediaCount <= 1) return;
    setCurrentPhotoIndex((prev) => (prev === mediaCount - 1 ? 0 : prev + 1));
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
        <Button onClick={() => navigate(-1)} variant="outlined" sx={{ mt: 2, ...BACK_BUTTON_SX }}>
          Back
        </Button>
      </Box>
    );
  }

  const isOwner = currentUser && currentUser.uid === listing.userId;
  const isOwnerMenuOpen = Boolean(ownerMenuAnchorEl);
  const listedLocationLabel = formatListedLocationLabel(
    listing.meetupLocation,
    listing.meetupLocationLabel || listing.location
  );
  const hasOpenConversation =
    existingConversation && existingConversation.status !== "rejected";
  const cameFromPublish = Boolean(location.state?.fromPublish);
  const isListingUnavailable =
    listing.status === "sold" || listing.status === "archived";
  const primaryActionText =
    listing.status === "archived"
      ? "Pending"
      : hasOpenConversation
        ? "Continue Chat"
        : "Send Message";
  const handleMessageAction = hasOpenConversation
    ? () => navigate(`/messages/${existingConversation.id}`)
    : openMessageDialog;
  const handleOwnerPrimaryAction = listing.status === "sold"
    ? () => openStatusConfirmDialog("active")
    : openMarkSoldDialog;
  const ownerPrimaryActionText = listing.status === "sold"
    ? "Mark as Available"
    : "Mark as Sold";

  return (
    <Box
      sx={{
        width: { xs: "100%", lg: "86vw" },
        maxWidth: 1180,
        height: { lg: "calc(100dvh - 64px)" },
        boxSizing: "border-box",
        overflow: { lg: "hidden" },
        display: { lg: "flex" },
        flexDirection: { lg: "column" },
        mx: "auto",
        px: { xs: 1.5, md: 2.5 },
        py: { xs: 2, lg: 1.5 },
        mt: { xs: 1, lg: 0 },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: { xs: 2, lg: 1.25 },
          flexShrink: 0,
        }}
      >
        <Button
          onClick={() => (cameFromPublish ? navigate("/") : navigate(-1))}
          variant="outlined"
          sx={BACK_BUTTON_SX}
        >
          {cameFromPublish ? "← Home" : "← Back"}
        </Button>
        {isOwner ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              color={listing.status === "sold" ? "success" : "primary"}
              startIcon={
                listing.status === "sold" ? <Restore /> : <CheckCircle />
              }
              onClick={handleOwnerPrimaryAction}
              disabled={statusActionLoading || deleteLoading}
            >
              {ownerPrimaryActionText}
            </Button>
            <IconButton
              onClick={(event) => setOwnerMenuAnchorEl(event.currentTarget)}
              disabled={statusActionLoading || deleteLoading}
              aria-label="Listing actions"
              aria-controls={isOwnerMenuOpen ? "owner-listing-actions" : undefined}
              aria-haspopup="true"
              aria-expanded={isOwnerMenuOpen ? "true" : undefined}
              sx={{
                border: 1,
                borderColor: "divider",
              }}
            >
              <MoreVert />
            </IconButton>
            <Menu
              id="owner-listing-actions"
              anchorEl={ownerMenuAnchorEl}
              open={isOwnerMenuOpen}
              onClose={closeOwnerMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem
                onClick={() => {
                  closeOwnerMenu();
                  handleEditToggle();
                }}
              >
                <Edit fontSize="small" sx={{ mr: 1.25 }} />
                Edit Listing
              </MenuItem>
              {listing.status === "archived" ? (
                <MenuItem onClick={() => openStatusConfirmDialog("active")}>
                  <Restore fontSize="small" sx={{ mr: 1.25 }} />
                  Mark as Available
                </MenuItem>
              ) : listing.status === "active" || !listing.status ? (
                <MenuItem onClick={() => openStatusConfirmDialog("archived")}>
                  <PendingActions fontSize="small" sx={{ mr: 1.25 }} />
                  Mark as Pending
                </MenuItem>
              ) : null}
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={openDeleteDialog} sx={{ color: "error.main" }}>
                <Delete fontSize="small" sx={{ mr: 1.25 }} />
                Delete Listing
              </MenuItem>
            </Menu>
          </Box>
        ) : null}
      </Box>

      <Grid
        container
        spacing={{ xs: 2, lg: 2.5 }}
        alignItems="stretch"
        sx={{
          flex: { lg: 1 },
          height: { lg: "auto" },
          minHeight: { lg: 0 },
        }}
      >
        {/* Images Section */}
        <Grid size={{ xs: 12, lg: 7 }} sx={{ height: { lg: "100%" }, minHeight: 0 }}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 0.75, md: 1 },
              position: { lg: "sticky" },
              top: { lg: 24 },
              height: { lg: "100%" },
              display: "flex",
              flexDirection: "column",
              borderColor: "divider",
              bgcolor: "background.paper",
              boxShadow: "0 10px 28px rgba(31, 53, 99, 0.07)",
            }}
          >
            {activeMedia ? (
              <Stack spacing={1} sx={{ height: { lg: "100%" }, minHeight: 0 }}>
                <Box
                  sx={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: { xs: "1 / 1", lg: "auto" },
                    flex: { lg: 1 },
                    minHeight: { lg: 0 },
                    borderRadius: 1.5,
                    overflow: "hidden",
                    backgroundColor: "grey.50",
                  }}
                >
                  {listing.status === "sold" && <SoldRibbon size="large" />}
                  {listing.status === "archived" && <PendingBadge size="large" />}
                  {activeMedia.mediaType === "video" ? (
                    <Box
                      component="video"
                      src={getS3PublicUrl(activeMedia.s3Key)}
                      controls
                      playsInline
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                        bgcolor: "grey.900",
                      }}
                    />
                  ) : (
                    <Box
                      component="img"
                      src={getS3PublicUrl(activeMedia.s3Key)}
                      alt={`Listing photo ${currentPhotoIndex + 1}`}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                      onError={(e) => {
                        console.error("Failed to load image:", activeMedia.s3Key);
                        e.target.style.display = "none";
                      }}
                    />
                  )}

                  {mediaCount > 1 && (
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

                {mediaCount > 1 && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ overflowX: "auto", pb: 0.5, flexShrink: 0 }}
                  >
                    {mediaItems.map((media, index) => (
                      <Box
                        key={media.s3Key || index}
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
                        {media.mediaType === "video" ? (
                          <Box
                            sx={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              bgcolor: "grey.900",
                              color: "common.white",
                            }}
                          >
                            <PlayCircleOutline fontSize="small" />
                          </Box>
                        ) : (
                          <Box
                            component="img"
                            src={getS3PublicUrl(media.s3Key)}
                            alt={`Thumbnail ${index + 1}`}
                            sx={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}

                {mediaCount > 1 && (
                  <Typography variant="body2" color="text.secondary">
                    {currentPhotoIndex + 1} of {mediaCount}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No media available
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Details Section */}
        <Grid
          size={{ xs: 12, lg: 5 }}
          sx={{
            height: { lg: "100%" },
            minHeight: 0,
            overflowY: { lg: "auto" },
            pr: { lg: 0.5 },
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.75, md: 2.25 },
              borderColor: "divider",
              boxShadow: "0 10px 28px rgba(31, 53, 99, 0.07)",
            }}
          >
            <Stack spacing={1.6}>
              <Box>
                <Typography
                  variant="h4"
                  component="h1"
                  fontWeight={600}
                  sx={{ lineHeight: 1.12, mb: 0.5 }}
                >
                  {listing.title}
                </Typography>
                <Typography
                  variant="h4"
                  color="text.primary"
                  fontWeight={600}
                  sx={{ lineHeight: 1 }}
                >
                  {formatPrice(listing.price)}
                </Typography>
                {formatShippingPriceNote(listing) && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5, fontWeight: 500 }}
                  >
                    {formatShippingPriceNote(listing)}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  columnGap: 2,
                  rowGap: 0.7,
                  py: 0.5,
                }}
              >
                {[
                  ["Condition", getConditionLabel(listing.condition)],
                  listedLocationLabel ? ["Listed in", listedLocationLabel] : null,
                ]
                  .filter(Boolean)
                  .map(([label, value]) => (
                    <Box key={label} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {value}
                      </Typography>
                    </Box>
                  ))}
              </Box>

              {!isOwner && (
                <Stack>
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
              )}

              <Box sx={{ pt: 1.2, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.6 }}>
                  Description
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                    color: "text.primary",
                    ...(shouldCollapseDescription && !showFullDescription
                      ? {
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 5,
                          overflow: "hidden",
                        }
                      : {}),
                  }}
                >
                  {descriptionText}
                </Typography>
                {shouldCollapseDescription && (
                  <Button
                    variant="text"
                    size="small"
                    sx={{ mt: 0.5, px: 0, alignSelf: "flex-start" }}
                    onClick={() => setShowFullDescription((prev) => !prev)}
                  >
                    {showFullDescription ? "Show less" : "See more"}
                  </Button>
                )}
              </Box>

              <Box sx={{ pt: 1.2, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
                  Fulfillment Options
                </Typography>

                <Stack spacing={0.9}>
                  {listing.localMeetupAvailable && (
                    <Box>
                      <FulfillmentInfoTitle>
                        Local Meetup
                      </FulfillmentInfoTitle>
                      <Typography
                        variant="body2"
                        sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 500, mb: 0.75 }}
                      >
                        <LocationOn fontSize="small" />
                        {listing.meetupLocationLabel || "Meetup area"}
                      </Typography>
                      <ApproximateMeetupMap
                        location={listing.meetupLocation}
                        label={listing.meetupLocationLabel}
                      />
                    </Box>
                  )}

                  {listing.competitionMeetupAvailable && (
                    <Box>
                      <FulfillmentInfoTitle>
                        Competition Meetup
                      </FulfillmentInfoTitle>
                      {meetupCompetitionTags.length > 0 ? (
                        <Stack spacing={0.4}>
                          {visibleCompetitionMeetups.map((competition) => (
                            <Box
                              key={competition.id || competition.name}
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
                                display: "flex",
                                alignItems: "center",
                                gap: 0.9,
                                minWidth: 0,
                                py: 0.55,
                                px: 0.6,
                                mx: -0.6,
                                borderRadius: 1,
                                cursor: "pointer",
                                transition: "background-color 0.2s, color 0.2s",
                                "&:hover": {
                                  bgcolor: "action.hover",
                                  color: "primary.main",
                                },
                                "&:focus-visible": {
                                  outline: "2px solid",
                                  outlineColor: "primary.main",
                                  outlineOffset: 2,
                                },
                              }}
                            >
                              <Groups sx={{ fontSize: 18, color: "text.primary", flexShrink: 0 }} />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" fontWeight={500} noWrap>
                                  {competition.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap component="div">
                                  {[competition.city, competition.country]
                                    .filter(Boolean)
                                    .join(", ")}
                                  {competition.dateRange ? ` • ${competition.dateRange}` : ""}
                                </Typography>
                              </Box>
                            </Box>
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
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 500 }}
                        >
                          <Groups fontSize="small" />
                          Available at selected competitions
                        </Typography>
                      )}
                    </Box>
                  )}

                  {listing.shippingAvailable && (
                    <Box>
                      <FulfillmentInfoTitle>
                        Ships to You
                      </FulfillmentInfoTitle>
                      <Typography
                        variant="body2"
                        sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 500 }}
                      >
                        <LocalShipping fontSize="small" />
                        {formatShippingDetail(listing)}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Box>

              <Box sx={{ pt: 1.2, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.6 }}>
                  Seller Information
                </Typography>
                <Stack
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/seller/${listing.userId}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/seller/${listing.userId}`);
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 1.5,
                    p: 0.6,
                    mx: -0.6,
                    transition: "background-color 0.2s",
                    "&:hover": {
                      bgcolor: "action.hover",
                    },
                    "&:focus-visible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Avatar
                    src={listing.sellerAvatarUrl || undefined}
                    sx={{ width: 44, height: 44 }}
                  >
                    {listing.sellerName?.charAt(0)?.toUpperCase() || "S"}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {listing.sellerName}
                    </Typography>
                    {listing.sellerReviewCount > 0 ? (
                      <Typography
                        variant="caption"
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
                      <Typography variant="caption" color="text.secondary">
                        No reviews yet
                      </Typography>
                    )}
                  </Box>
                </Stack>

                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.7 }}>
                  Listed on {formatDate(listing.createdAt)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Dialog
        open={showMarkSoldDialog}
        onClose={closeMarkSoldDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mark Listing as Sold</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {[
                {
                  value: "in_app",
                  label: "Sold in app",
                },
                {
                  value: "off_app",
                  label: "Sold off app",
                },
              ].map((option) => {
                const isSelected = soldMethodChoice === option.value;
                return (
                  <Button
                    key={option.value}
                    variant={isSelected ? "contained" : "outlined"}
                    onClick={() => {
                      setSoldMethodChoice(option.value);
                      if (option.value === "off_app") {
                        setSelectedBuyerConversationId("");
                      }
                    }}
                    sx={{
                      flex: 1,
                      justifyContent: "center",
                      color: isSelected ? "common.white" : "text.primary",
                      borderColor: isSelected
                        ? "primary.main"
                        : "rgba(148, 163, 184, 0.28)",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: "primary.main",
                        boxShadow: "none",
                      },
                    }}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </Stack>

            {soldMethodChoice === "in_app" && (
              <>
                {loadingBuyerOptions ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading buyer conversations...
                  </Typography>
                ) : buyerOptions.length > 0 ? (
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Choose who bought the puzzle.
                    </Typography>
                    <Box
                      sx={{
                        maxHeight: 260,
                        overflowY: "auto",
                        pr: 0.5,
                      }}
                    >
                      <Stack spacing={0.75}>
                        {buyerOptions.map((buyer) => {
                          const isSelected =
                            selectedBuyerConversationId === buyer.conversationId;
                          return (
                            <Card
                              key={buyer.conversationId}
                              variant="outlined"
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setSelectedBuyerConversationId(buyer.conversationId)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedBuyerConversationId(
                                    buyer.conversationId
                                  );
                                }
                              }}
                              sx={{
                                cursor: "pointer",
                                borderColor: isSelected ? "primary.main" : "divider",
                                bgcolor: isSelected
                                  ? "action.selected"
                                  : "background.paper",
                              }}
                            >
                              <CardContent
                                sx={{
                                  py: 1,
                                  px: 1.25,
                                  "&:last-child": { pb: 1 },
                                }}
                              >
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <Radio
                                    checked={isSelected}
                                    value={buyer.conversationId}
                                    inputProps={{
                                      "aria-label": `Select ${buyer.buyerName}`,
                                    }}
                                    sx={{ p: 0.25 }}
                                  />
                                  <Avatar
                                    src={buyer.buyerAvatarUrl || undefined}
                                    alt={buyer.buyerName}
                                    sx={{ width: 38, height: 38 }}
                                  >
                                    {buyer.buyerName.charAt(0).toUpperCase()}
                                  </Avatar>
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                      variant="subtitle2"
                                      noWrap
                                      sx={{ minWidth: 0 }}
                                    >
                                      {buyer.buyerName}
                                    </Typography>
                                    {buyer.buyerEmail && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        noWrap
                                        component="div"
                                      >
                                        {buyer.buyerEmail}
                                      </Typography>
                                    )}
                                  </Box>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Stack>
                    </Box>
                  </Stack>
                ) : (
                  <Alert severity="info">
                    No buyer chats were found. Choose sold off app if this sale
                    happened outside WeCube.
                  </Alert>
                )}
              </>
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
            color="primary"
            disabled={
              statusActionLoading ||
              (soldMethodChoice === "in_app" &&
                (loadingBuyerOptions || !selectedBuyerConversationId))
            }
          >
            Mark as Sold
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={statusConfirmDialog.open}
        onClose={closeStatusConfirmDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {statusConfirmDialog.status === "active"
            ? "Mark as Available?"
            : "Mark as Pending?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {statusConfirmDialog.status === "active"
              ? `This will make "${listing.title}" available again and notify existing buyer chats.`
              : `This will mark "${listing.title}" as pending and prevent new buyers from messaging about it.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeStatusConfirmDialog}
            color="inherit"
            disabled={statusActionLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmStatusUpdate}
            variant="contained"
            color="primary"
            disabled={statusActionLoading}
          >
            {statusConfirmDialog.status === "active"
              ? "Mark as Available"
              : "Mark as Pending"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showDeleteDialog}
        onClose={closeDeleteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Listing</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Permanently delete "{listing.title}"? This removes the listing and
            its uploaded media. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} color="inherit" disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteListing}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? "Deleting..." : "Delete"}
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
                  variant="filled"
                  sx={{ alignItems: "center" }}
                >
                  {editNotice.message}
                </Alert>
              )}
            </Collapse>

            <TextField
              label="Title"
              fullWidth
              placeholder="ex. Gan 16 Maglev UV"
              value={editData.title}
              onChange={handleInputChange("title")}
              error={isEditTitleInvalid}
              helperText={isEditTitleInvalid ? "Enter a title." : ""}
              slotProps={{
                htmlInput: {
                  maxLength: INPUT_LIMITS.LISTING_TITLE,
                },
              }}
              required
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Price"
                  placeholder="0.00"
                  value={editData.price}
                  onChange={handlePriceChange}
                  error={isEditPriceInvalid}
                  helperText={
                    isEditPriceInvalid
                      ? `Enter a price from $0 to $${INPUT_LIMITS.LISTING_PRICE_MAX.toLocaleString()}.`
                      : ""
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                    },
                    htmlInput: {
                      inputMode: "numeric",
                      max: INPUT_LIMITS.LISTING_PRICE_MAX,
                    },
                  }}
                  sx={{
                    width: 108,
                    "& .MuiInputAdornment-root": { mr: 0.25 },
                    "& .MuiOutlinedInput-input": { px: 0.5 },
                  }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required error={isEditPuzzleTypeInvalid}>
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
                  {isEditPuzzleTypeInvalid && (
                    <FormHelperText>Select a puzzle type.</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required error={isEditConditionInvalid}>
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
                  {isEditConditionInvalid && (
                    <FormHelperText>Select a condition.</FormHelperText>
                  )}
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={editData.description}
              onChange={handleInputChange("description")}
              error={isEditDescriptionInvalid}
              helperText={
                isEditDescriptionInvalid
                  ? "Enter a description."
                  : characterCountText(
                      editData.description,
                      INPUT_LIMITS.LISTING_DESCRIPTION
                    )
              }
              slotProps={{
                htmlInput: {
                  maxLength: INPUT_LIMITS.LISTING_DESCRIPTION,
                },
              }}
            />

            <FormControl
              required
              error={
                hasAttemptedEditSave &&
                (!isEditDeliveryValid || !isEditCompetitionValid)
              }
            >
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
                        label="Shipping"
                        placeholder="0.00"
                        value={editData.shippingCost}
                        onChange={handleShippingCostChange}
                        error={hasAttemptedEditSave && !isEditShippingCostValid}
                        helperText={
                          hasAttemptedEditSave && !isEditShippingCostValid
                            ? `Enter a shipping price from $0.01 to $${INPUT_LIMITS.SHIPPING_COST_MAX}.`
                            : "Set a shipping price greater than $0 that buyers should expect to pay you directly."
                        }
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">$</InputAdornment>
                            ),
                          },
                          htmlInput: {
                            inputMode: "numeric",
                            max: INPUT_LIMITS.SHIPPING_COST_MAX,
                          },
                        }}
                        required
                        sx={{
                          mb: 2,
                          width: 98,
                          "& .MuiInputAdornment-root": { mr: 0.25 },
                          "& .MuiOutlinedInput-input": { px: 0.5 },
                        }}
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
                      value={editData.meetupLocation}
                      inputValue={editData.meetupLocationLabel}
                      getOptionLabel={getLocationOptionLabel}
                      isOptionEqualToValue={(option, value) =>
                        option?.label === value?.label
                      }
                      onChange={(_, newValue) => {
                        const selectedLocation =
                          typeof newValue === "string" ? null : newValue;
                        const label = clampText(
                          getLocationOptionLabel(newValue),
                          INPUT_LIMITS.LOCATION_LABEL
                        );
                        setEditNotice(null);
                        setEditData((prev) => ({
                          ...prev,
                          meetupLocationLabel: label,
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
                          meetupLocationLabel: clampText(
                            newInputValue,
                            INPUT_LIMITS.LOCATION_LABEL
                          ),
                          meetupLocation:
                            newInputValue === prev.meetupLocation?.label
                              ? prev.meetupLocation
                              : null,
                        }));
                      }}
                      loading={loadingLocations}
                      noOptionsText={
                        editData.meetupLocationLabel.trim().length < 2
                          ? "Start typing a location..."
                          : "No matching locations found"
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="General Meetup Area"
                          placeholder="ex. Los Angeles, CA"
                          helperText={
                            hasAttemptedEditSave && !isEditMeetupLocationValid
                              ? "Select a location from the list."
                              : "Keep this approximate, not an exact address."
                          }
                          error={
                            hasAttemptedEditSave && !isEditMeetupLocationValid
                          }
                          slotProps={{
                            htmlInput: {
                              ...params.inputProps,
                              maxLength: INPUT_LIMITS.LOCATION_LABEL,
                            },
                          }}
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
                        placeholder="Search competitions..."
                        error={hasAttemptedEditSave && !isEditCompetitionValid}
                        helperText={
                          hasAttemptedEditSave && !isEditCompetitionValid
                            ? "Select at least one competition."
                            : ""
                        }
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
              {!isEditDeliveryValid && (
                  <FormHelperText error={hasAttemptedEditSave}>
                    Please select at least one fulfillment method
                  </FormHelperText>
              )}
              {editData.competitionMeetupAvailable &&
                !isEditCompetitionValid && (
                  <FormHelperText error={hasAttemptedEditSave}>
                    Please select at least one competition
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
            Message {listing.sellerName || "Seller"}
            <Button onClick={handleMessageDialogClose} disabled={sendingMessage}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
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
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => {
              setMessageNotice(null);
              setMessageText(
                clampText(e.target.value, INPUT_LIMITS.MESSAGE_TEXT)
              );
            }}
            placeholder="Please type your message to the seller"
            slotProps={{
              htmlInput: {
                maxLength: INPUT_LIMITS.MESSAGE_TEXT,
              },
            }}
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
            {sendingMessage ? "Sending..." : "Send Message"}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default ListingDetail;
