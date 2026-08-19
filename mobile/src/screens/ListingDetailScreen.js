import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { MaterialIcons } from "@expo/vector-icons";
import ActionSheet from "../components/ActionSheet";
import ApproximateMeetupMap from "../components/ApproximateMeetupMap";
import BackButton from "../components/BackButton";
import ClearableTextInput from "../components/ClearableTextInput";
import PageState from "../components/PageState";
import Screen from "../components/Screen";
import Toggle from "../components/Toggle";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { radii, typography } from "../theme/design";
import {
  CONDITION_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  formatListingPrice,
  getCompetitionTags,
} from "../utils/listingUtils";
import {
  characterCountText,
  clampText,
  formatCurrencyInputFromDigits,
  INPUT_LIMITS,
} from "../utils/inputLimits";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import {
  cancelListingReviewPrompts,
  closeListingConversationsForDeletedListing,
  closeListingConversationsForSold,
  createConversation,
  getExistingConversation,
  getListingBuyerOptions,
  getUserProfile,
} from "../utils/messaging";
import { deleteMultipleImages, getS3PublicUrl } from "../utils/s3";
import { searchCompetitions } from "../utils/wcaApi";

const LISTING_REPORT_REASONS = [
  { value: "inappropriate_image", label: "Inappropriate image" },
  { value: "fake_or_misleading", label: "Fake or misleading listing" },
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_hate", label: "Harassment or hate" },
  { value: "prohibited_item", label: "Prohibited item" },
  { value: "other", label: "Other" },
];
const DESCRIPTION_PREVIEW_LINES = 4;
const DESCRIPTION_VIEW_MORE_THRESHOLD = 220;
const MY_COMPETITIONS_OPTION_ID = "__my_competitions__";
const COMPETITION_BATCH_SIZE = 25;
const INITIAL_COMPETITION_LIMIT = 12;

const MY_COMPETITIONS_OPTION = {
  id: MY_COMPETITIONS_OPTION_ID,
  name: "My competitions",
  displayName: "My competitions",
  isMyCompetitionsOption: true,
};

function parseNonNegativeCurrencyAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getListingCompetitionPayload(competition = {}, options = {}) {
  const payload = {
    id: competition.id || "",
    name: competition.name || "",
    city: competition.city || "",
    country: competition.country || competition.countryIso2 || "",
    latitude:
      typeof competition.latitude === "number" ? competition.latitude : null,
    longitude:
      typeof competition.longitude === "number" ? competition.longitude : null,
    displayName:
      competition.displayName || competition.name || "Competition meetup",
    dateRange: competition.dateRange || "",
  };

  if (options.includeSchedule) {
    payload.startDate = competition.startDate || null;
    payload.endDate = competition.endDate || null;
  }

  return payload;
}

function mergeCompetitionsById(currentCompetitions, competitionsToAdd) {
  const competitionsById = new Map(
    currentCompetitions
      .filter((competition) => !competition.isMyCompetitionsOption)
      .map((competition) => [competition.id, competition])
  );

  competitionsToAdd.forEach((competition) => {
    if (competition?.id && !competitionsById.has(competition.id)) {
      competitionsById.set(competition.id, competition);
    }
  });

  return [...competitionsById.values()];
}

function RequiredLabel({ children }) {
  return (
    <Text style={styles.editLabel}>
      {children}
      <Text style={styles.required}>*</Text>
    </Text>
  );
}

function HelperText({ children, error }) {
  if (!children) return null;
  return <Text style={[styles.editHelper, error && styles.editErrorText]}>{children}</Text>;
}

function SelectField({
  label,
  required,
  value,
  placeholder,
  error,
  helperText,
  options,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <View>
      {required ? (
        <RequiredLabel>{label}</RequiredLabel>
      ) : (
        <Text style={styles.editLabel}>{label}</Text>
      )}
      <Pressable
        style={[styles.editInput, styles.editSelectInput, error && styles.editInputError]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.editSelectText,
            !selectedOption && styles.editPlaceholderText,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.muted} />
      </Pressable>
      <HelperText error={error}>{helperText}</HelperText>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.selectBackdrop}>
          <View style={styles.selectPanel}>
            <View style={styles.selectHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable style={styles.selectCloseButton} onPress={() => setOpen(false)}>
                <MaterialIcons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.selectOption,
                    selected && styles.selectOptionSelected,
                  ]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      selected && styles.selectOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatShipping(listing) {
  if (!listing?.shippingAvailable) return null;
  if (listing.shippingIncluded || Number(listing.shippingCost || 0) === 0) {
    return "Free shipping";
  }
  return `+${formatListingPrice(listing.shippingCost)} shipping`;
}

function getFulfillmentIconName(value) {
  if (value === "shipping") return "local-shipping";
  if (value === "competition") return "groups";
  return "location-on";
}

export default function ListingDetailScreen({ navigation, route }) {
  const { currentUser } = useAuth();
  const { listingId } = route.params || {};
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [seller, setSeller] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [messageDraftOpen, setMessageDraftOpen] = useState(false);
  const [initialMessageDraft, setInitialMessageDraft] = useState("");
  const [savingListingBookmark, setSavingListingBookmark] = useState(false);
  const [existingConversation, setExistingConversation] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);
  const [loadingBuyerOptions, setLoadingBuyerOptions] = useState(false);
  const [soldMethodChoice, setSoldMethodChoice] = useState("in_app");
  const [selectedBuyerConversationId, setSelectedBuyerConversationId] = useState("");
  const [deletingListing, setDeletingListing] = useState(false);
  const [ownerActionsOpen, setOwnerActionsOpen] = useState(false);
  const [viewerActionsOpen, setViewerActionsOpen] = useState(false);
  const [activeFulfillmentOption, setActiveFulfillmentOption] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    puzzleType: "",
    meetupLocationLabel: "",
    meetupLocation: null,
    shippingAvailable: false,
    shippingCost: "0.00",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
  });
  const [editNotice, setEditNotice] = useState("");
  const [hasAttemptedEditSave, setHasAttemptedEditSave] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editLocationOptions, setEditLocationOptions] = useState([]);
  const [hasEditedLocationSearch, setHasEditedLocationSearch] = useState(false);
  const [loadingEditLocations, setLoadingEditLocations] = useState(false);
  const [editCompetitions, setEditCompetitions] = useState([]);
  const [editCompetitionSearchInput, setEditCompetitionSearchInput] = useState("");
  const [hasEditedCompetitionSearch, setHasEditedCompetitionSearch] = useState(false);
  const [editCompetitionDropdownOpen, setEditCompetitionDropdownOpen] = useState(false);
  const [editCompetitionLimit, setEditCompetitionLimit] = useState(INITIAL_COMPETITION_LIMIT);
  const [loadingEditCompetitions, setLoadingEditCompetitions] = useState(false);
  const [selectedEditCompetitions, setSelectedEditCompetitions] = useState([]);
  const isOwnListing = currentUser?.uid && currentUser.uid === listing?.userId;

  useEffect(() => {
    if (!listingId) {
      setError("Listing is missing.");
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "listings", listingId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Listing not found.");
          setListing(null);
        } else {
          setListing({ id: snapshot.id, ...snapshot.data() });
          setError("");
        }
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Error loading mobile listing detail:", snapshotError);
        setError("Unable to load this listing.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [listingId]);

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [listing?.id]);

  useEffect(() => {
    let active = true;

    async function loadSeller() {
      if (!listing?.userId) {
        setSeller(null);
        return;
      }

      try {
        const sellerProfile = await getUserProfile(listing.userId);
        if (active) setSeller(sellerProfile);
      } catch (sellerError) {
        console.error("Error loading mobile listing seller:", sellerError);
        if (active) setSeller(null);
      }
    }

    loadSeller();

    return () => {
      active = false;
    };
  }, [listing?.userId]);

  useEffect(() => {
    let active = true;

    async function loadExistingConversation() {
      if (!currentUser?.uid || !listing?.id || isOwnListing) {
        setExistingConversation(null);
        return;
      }

      try {
        const conversation = await getExistingConversation(listing.id, currentUser.uid);
        if (active) setExistingConversation(conversation);
      } catch (conversationError) {
        console.error("Error loading mobile existing conversation:", conversationError);
        if (active) setExistingConversation(null);
      }
    }

    loadExistingConversation();

    return () => {
      active = false;
    };
  }, [currentUser?.uid, isOwnListing, listing?.id]);

  useEffect(() => {
    let active = true;
    const query = editData.meetupLocationLabel.trim();

    if (
      !editOpen ||
      !editData.localMeetupAvailable ||
      !hasEditedLocationSearch ||
      query.length < 2 ||
      query === editData.meetupLocation?.label
    ) {
      setEditLocationOptions([]);
      setLoadingEditLocations(false);
      return undefined;
    }

    setLoadingEditLocations(true);
    const timeoutId = setTimeout(async () => {
      try {
        const options = await fetchLocationSuggestionOptions(query);
        if (active) setEditLocationOptions(options);
      } catch (locationError) {
        console.error("Error loading mobile edit meetup locations:", locationError);
        if (active) setEditLocationOptions([]);
      } finally {
        if (active) setLoadingEditLocations(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [
    editData.localMeetupAvailable,
    editData.meetupLocation,
    editData.meetupLocationLabel,
    editOpen,
    hasEditedLocationSearch,
  ]);

  useEffect(() => {
    if (
      !editOpen ||
      !editData.competitionMeetupAvailable ||
      !editCompetitionDropdownOpen
    ) {
      return;
    }
    setEditCompetitionLimit(INITIAL_COMPETITION_LIMIT);
  }, [
    editCompetitionDropdownOpen,
    editData.competitionMeetupAvailable,
    editCompetitionSearchInput,
    editOpen,
  ]);

  useEffect(() => {
    let active = true;

    if (
      !editOpen ||
      !editData.competitionMeetupAvailable ||
      !editCompetitionDropdownOpen
    ) {
      setEditCompetitions([]);
      setLoadingEditCompetitions(false);
      return undefined;
    }

    setLoadingEditCompetitions(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCompetitions(
          editCompetitionSearchInput,
          editCompetitionLimit
        );
        if (active) setEditCompetitions(results);
      } catch (competitionError) {
        console.error("Error loading mobile edit competitions:", competitionError);
        if (active) setEditCompetitions([]);
      } finally {
        if (active) setLoadingEditCompetitions(false);
      }
    }, editCompetitionSearchInput.trim().length >= 2 ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [
    editCompetitionLimit,
    editCompetitionDropdownOpen,
    editCompetitionSearchInput,
    editData.competitionMeetupAvailable,
    editOpen,
  ]);

  const photos = listing?.photos || [];
  const activePhoto = photos[photoIndex];
  const activePhotoUrl = activePhoto?.s3Key ? getS3PublicUrl(activePhoto.s3Key) : null;
  const meetupCompetitionTags = useMemo(() => getCompetitionTags(listing), [listing]);
  const bookmarkedCompetitions = currentUser?.attendingCompetitions || [];
  const editCompetitionOptions = useMemo(
    () => {
      if (!editCompetitionDropdownOpen) return [];

      return bookmarkedCompetitions.length > 0
        ? [MY_COMPETITIONS_OPTION, ...editCompetitions]
        : editCompetitions;
    },
    [bookmarkedCompetitions.length, editCompetitionDropdownOpen, editCompetitions]
  );
  const selectedEditCompetitionIds = useMemo(
    () => new Set(selectedEditCompetitions.map((competition) => competition.id)),
    [selectedEditCompetitions]
  );
  const isSavedListing = Boolean(currentUser?.savedListings?.includes(listing?.id));
  const sellerFirstName =
    `${seller?.firstName || ""}`.trim() ||
    `${seller?.displayName || ""}`.trim().split(/\s+/)[0] ||
    "Seller";
  const isListingUnavailable =
    listing?.status === "sold" || listing?.status === "archived";
  const descriptionText = listing?.description || "No description provided.";
  const canExpandDescription =
    Boolean(listing?.description) &&
    listing.description.length > DESCRIPTION_VIEW_MORE_THRESHOLD;
  const fulfillmentOptions = [
    listing?.localMeetupAvailable
      ? { value: "local", label: "Local" }
      : null,
    listing?.competitionMeetupAvailable
      ? { value: "competition", label: "Competition" }
      : null,
    listing?.shippingAvailable ? { value: "shipping", label: "Shipping" } : null,
  ].filter(Boolean);
  const selectedFulfillmentOption =
    fulfillmentOptions.find((option) => option.value === activeFulfillmentOption) ||
    fulfillmentOptions[0];
  const selectedFulfillmentValue = selectedFulfillmentOption?.value;
  const isEditDeliveryValid =
    editData.shippingAvailable ||
    editData.localMeetupAvailable ||
    editData.competitionMeetupAvailable;
  const isEditMeetupLocationValid =
    !editData.localMeetupAvailable ||
    (Boolean(editData.meetupLocationLabel.trim()) &&
      editData.meetupLocation?.label === editData.meetupLocationLabel.trim());
  const isEditCompetitionValid =
    !editData.competitionMeetupAvailable || selectedEditCompetitions.length > 0;
  const isEditShippingCostValid =
    !editData.shippingAvailable ||
    (parseNonNegativeCurrencyAmount(editData.shippingCost) !== null &&
      parseNonNegativeCurrencyAmount(editData.shippingCost) <=
        INPUT_LIMITS.SHIPPING_COST_MAX);
  const isEditTitleInvalid = hasAttemptedEditSave && !editData.title.trim();
  const isEditPriceInvalid =
    hasAttemptedEditSave &&
    (!editData.price ||
      parseNonNegativeCurrencyAmount(editData.price) === null ||
      parseNonNegativeCurrencyAmount(editData.price) >
        INPUT_LIMITS.LISTING_PRICE_MAX);
  const isEditPuzzleTypeInvalid = hasAttemptedEditSave && !editData.puzzleType;
  const isEditConditionInvalid = hasAttemptedEditSave && !editData.condition;
  const isEditDescriptionInvalid =
    hasAttemptedEditSave && !editData.description.trim();

  function openCompetitionListings(competition) {
    if (!competition?.id) return;

    navigation.getParent()?.navigate("Competitions", {
      screen: "CompetitionListings",
      initial: false,
      params: {
        competitionId: competition.id,
        competition,
      },
    });
  }

  function handlePreviousPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  }

  function handleNextPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  }

  function clearEditNotice() {
    if (editNotice) setEditNotice("");
  }

  function openEditListingModal() {
    if (!listing || !isOwnListing) return;

    const shippingCost = Number(listing.shippingCost || 0);
    setEditData({
      title: listing.title || "",
      price: Number.isFinite(Number(listing.price))
        ? Number(listing.price).toFixed(2)
        : "",
      description: listing.description || "",
      condition: listing.condition || "",
      puzzleType: listing.puzzleType || "",
      meetupLocationLabel: listing.meetupLocationLabel || "",
      meetupLocation: listing.meetupLocation || null,
      shippingAvailable: Boolean(listing.shippingAvailable),
      shippingCost: shippingCost > 0 ? shippingCost.toFixed(2) : "0.00",
      localMeetupAvailable: Boolean(listing.localMeetupAvailable),
      competitionMeetupAvailable: Boolean(listing.competitionMeetupAvailable),
    });
    setSelectedEditCompetitions(getCompetitionTags(listing));
    setEditCompetitionSearchInput("");
    setEditCompetitionDropdownOpen(false);
    setHasEditedLocationSearch(false);
    setHasEditedCompetitionSearch(false);
    setEditCompetitions([]);
    setEditLocationOptions([]);
    setEditNotice("");
    setHasAttemptedEditSave(false);
    setOwnerActionsOpen(false);
    setEditOpen(true);
  }

  function closeEditListingModal() {
    if (savingEdit) return;
    setEditOpen(false);
    setEditCompetitionDropdownOpen(false);
    setEditNotice("");
    setHasAttemptedEditSave(false);
  }

  function handleEditTitleChange(value) {
    clearEditNotice();
    setEditData((current) => ({
      ...current,
      title: clampText(value, INPUT_LIMITS.LISTING_TITLE),
    }));
  }

  function handleEditDescriptionChange(value) {
    clearEditNotice();
    setEditData((current) => ({
      ...current,
      description: clampText(value, INPUT_LIMITS.LISTING_DESCRIPTION),
    }));
  }

  function handleEditPriceChange(value) {
    const formattedValue = formatCurrencyInputFromDigits(
      value,
      INPUT_LIMITS.LISTING_PRICE_MAX
    );
    if (formattedValue === null) return;
    clearEditNotice();
    setEditData((current) => ({ ...current, price: formattedValue }));
  }

  function handleEditShippingCostChange(value) {
    const formattedValue = formatCurrencyInputFromDigits(
      value,
      INPUT_LIMITS.SHIPPING_COST_MAX
    );
    if (formattedValue === null) return;
    clearEditNotice();
    setEditData((current) => ({
      ...current,
      shippingCost: formattedValue || "0.00",
    }));
  }

  function handleEditLocalMeetupChange(value) {
    clearEditNotice();
    setEditData((current) => ({
      ...current,
      localMeetupAvailable: value,
      meetupLocationLabel: value ? current.meetupLocationLabel : "",
      meetupLocation: value ? current.meetupLocation : null,
    }));
    if (!value) setEditLocationOptions([]);
    if (!value) setHasEditedLocationSearch(false);
  }

  function handleEditCompetitionMeetupChange(value) {
    clearEditNotice();
    setEditData((current) => ({
      ...current,
      competitionMeetupAvailable: value,
    }));
    if (!value) {
      setEditCompetitionDropdownOpen(false);
      setSelectedEditCompetitions([]);
      setEditCompetitionSearchInput("");
      setHasEditedCompetitionSearch(false);
      setEditCompetitions([]);
    }
  }

  function handleEditCompetitionSelect(competition) {
    clearEditNotice();
    if (competition.isMyCompetitionsOption) {
      setSelectedEditCompetitions((current) =>
        mergeCompetitionsById(current, bookmarkedCompetitions)
      );
      setEditCompetitionSearchInput("");
      return;
    }

    setSelectedEditCompetitions((current) =>
      selectedEditCompetitionIds.has(competition.id)
        ? current.filter((item) => item.id !== competition.id)
        : [...current, competition]
    );
  }

  async function saveListingEdits() {
    setHasAttemptedEditSave(true);

    const parsedPrice = parseNonNegativeCurrencyAmount(editData.price);
    const parsedShippingCost = editData.shippingAvailable
      ? parseNonNegativeCurrencyAmount(editData.shippingCost)
      : 0;

    if (
      !listing?.id ||
      !isOwnListing ||
      !editData.title.trim() ||
      parsedPrice === null ||
      parsedPrice > INPUT_LIMITS.LISTING_PRICE_MAX ||
      !editData.puzzleType ||
      !editData.condition ||
      !editData.description.trim() ||
      !isEditDeliveryValid ||
      !isEditMeetupLocationValid ||
      !isEditCompetitionValid ||
      !isEditShippingCostValid
    ) {
      setEditNotice(
        !isEditDeliveryValid
          ? "Select at least one fulfillment method."
          : "Fill in all required fields before saving."
      );
      return;
    }

    setSavingEdit(true);
    setEditNotice("");
    try {
      const shippingCost = editData.shippingAvailable ? parsedShippingCost : 0;
      const meetupLocation =
        editData.localMeetupAvailable && editData.meetupLocation
          ? editData.meetupLocation
          : null;
      const competitions = editData.competitionMeetupAvailable
        ? selectedEditCompetitions
        : [];

      await updateDoc(doc(db, "listings", listing.id), {
        title: editData.title.trim(),
        price: parsedPrice,
        description: editData.description.trim(),
        condition: editData.condition,
        puzzleType: editData.puzzleType,
        meetupLocationLabel: editData.localMeetupAvailable
          ? editData.meetupLocationLabel.trim()
          : "",
        meetupLocation,
        shippingAvailable: editData.shippingAvailable,
        shippingIncluded: editData.shippingAvailable && shippingCost === 0,
        shippingCost,
        localMeetupAvailable: editData.localMeetupAvailable,
        competitionMeetupAvailable: editData.competitionMeetupAvailable,
        competitions: competitions.map((competition) =>
          getListingCompetitionPayload(competition, { includeSchedule: true })
        ),
        meetupCompetitionTags: competitions.map((competition) =>
          getListingCompetitionPayload(competition)
        ),
        updatedAt: new Date(),
      });

      setEditOpen(false);
      setHasAttemptedEditSave(false);
      Alert.alert("Listing updated", "Your changes have been saved.");
    } catch (editError) {
      console.error("Error updating mobile listing:", editError);
      setEditNotice(editError.message || "Unable to update listing. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  function getDefaultInitialMessage() {
    return `Hi, I'm interested in ${listing?.title || "this listing"}.`;
  }

  function handleMessageSeller() {
    if (!currentUser) {
      Alert.alert("Sign in required", "Sign in to message sellers.");
      return;
    }

    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot message yourself about your own listing.");
      return;
    }

    if (existingConversation?.id) {
      navigation.getParent()?.navigate("Messages", {
        screen: "Conversation",
        initial: false,
        params: { conversationId: existingConversation.id },
      });
      return;
    }

    if (isListingUnavailable) {
      Alert.alert("Listing unavailable", "This listing is not available for new messages.");
      return;
    }

    setInitialMessageDraft(getDefaultInitialMessage());
    setMessageDraftOpen(true);
  }

  function closeMessageDraftModal() {
    if (creatingConversation) return;
    setMessageDraftOpen(false);
    setInitialMessageDraft("");
  }

  async function sendInitialMessage() {
    const trimmedMessage = initialMessageDraft.trim();
    if (!trimmedMessage || !currentUser?.uid || !listing?.id || creatingConversation) return;

    setCreatingConversation(true);
    try {
      const conversationId = await createConversation({
        listingId: listing.id,
        sellerId: listing.userId,
        buyerId: currentUser.uid,
        initialMessage: trimmedMessage,
      });
      setMessageDraftOpen(false);
      setInitialMessageDraft("");
      navigation.getParent()?.navigate("Messages", {
        screen: "Conversation",
        initial: false,
        params: { conversationId },
      });
    } catch (conversationError) {
      console.error("Error creating mobile conversation:", conversationError);
      Alert.alert(
        "Unable to message seller",
        conversationError.message || "Please try again."
      );
    } finally {
      setCreatingConversation(false);
    }
  }

  async function updateListingStatus(nextStatus) {
    if (!listing?.id || !isOwnListing || statusUpdating) return;

    setStatusUpdating(true);
    try {
      const updates = {
        status: nextStatus,
        updatedAt: new Date(),
      };

      if (nextStatus === "archived") {
        updates.archivedAt = new Date();
      }

      if (nextStatus === "active") {
        updates.archivedAt = null;
        updates.soldAt = null;
        updates.soldMethod = null;
        updates.buyerId = null;
        updates.soldConversationId = null;
        updates.saleEventId = null;
      }

      await updateDoc(doc(db, "listings", listing.id), updates);

      if (nextStatus === "active") {
        await cancelListingReviewPrompts(
          listing.id,
          listing.userId,
          sellerFirstName,
          listing.title || "this listing"
        );
      }

      Alert.alert(
        "Listing updated",
        nextStatus === "active" ? "Listing marked as available." : "Listing marked as pending."
      );
    } catch (statusError) {
      console.error("Error updating mobile listing status:", statusError);
      Alert.alert("Unable to update listing", statusError.message || "Please try again.");
    } finally {
      setStatusUpdating(false);
    }
  }

  function confirmStatusChange(nextStatus) {
    const title =
      nextStatus === "active" ? "Mark as available?" : "Mark as pending?";
    const message =
      nextStatus === "active"
        ? `This will make "${listing.title || "this listing"}" available again and notify existing buyer chats.`
        : `This will mark "${listing.title || "this listing"}" as pending and prevent new buyers from messaging about it.`;

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: nextStatus === "active" ? "Mark Available" : "Mark Pending", onPress: () => updateListingStatus(nextStatus) },
    ]);
  }

  async function openMarkSoldModal() {
    if (!listing?.id || !isOwnListing || statusUpdating) return;

    setLoadingBuyerOptions(true);
    setMarkSoldOpen(true);
    setSoldMethodChoice("in_app");
    setSelectedBuyerConversationId("");
    try {
      const options = await getListingBuyerOptions(listing.id, listing.userId);
      setBuyerOptions(options);
    } catch (buyerError) {
      console.error("Error loading mobile buyer options:", buyerError);
      Alert.alert("Unable to load buyers", "You can still mark this sold off app.");
      setBuyerOptions([]);
    } finally {
      setLoadingBuyerOptions(false);
    }
  }

  function closeMarkSoldModal() {
    if (statusUpdating) return;
    setMarkSoldOpen(false);
    setBuyerOptions([]);
    setSoldMethodChoice("in_app");
    setSelectedBuyerConversationId("");
  }

  function confirmMarkSoldSelection() {
    if (!listing?.id || !isOwnListing || statusUpdating) return;

    const soldInApp = soldMethodChoice === "in_app";
    const selectedBuyer = soldInApp
      ? buyerOptions.find(
          (buyer) => buyer.conversationId === selectedBuyerConversationId
        ) || null
      : null;

    if (soldInApp && !selectedBuyer) {
      Alert.alert(
        "Select a buyer",
        "Choose who bought the puzzle, or switch to sold off app."
      );
      return;
    }

    const buyerName = selectedBuyer?.buyerName || "";
    Alert.alert(
      "Mark listing as sold?",
      selectedBuyer
        ? `This will mark "${listing.title || "this listing"}" as sold to ${buyerName} and send a review request in that chat.`
        : `This will mark "${listing.title || "this listing"}" as sold off app.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Sold",
          onPress: () => markListingSold(selectedBuyer),
        },
      ]
    );
  }

  async function markListingSold(selectedBuyer = null) {
    if (!listing?.id || !isOwnListing || statusUpdating) return;

    const saleEventId = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setStatusUpdating(true);
    try {
      await updateDoc(doc(db, "listings", listing.id), {
        status: "sold",
        soldAt: new Date(),
        updatedAt: new Date(),
        soldMethod: selectedBuyer ? "buyer_selected" : "sold_off_app",
        buyerId: selectedBuyer?.buyerId || null,
        soldConversationId: selectedBuyer?.conversationId || null,
        saleEventId: selectedBuyer ? saleEventId : null,
      });

      if (selectedBuyer) {
        await closeListingConversationsForSold({
          listingId: listing.id,
          sellerId: listing.userId,
          sellerFirstName,
          listingTitle: listing.title || "this listing",
          saleEventId,
          soldConversationId: selectedBuyer.conversationId,
          buyerId: selectedBuyer.buyerId,
        });
      }

      setMarkSoldOpen(false);
      setBuyerOptions([]);
      Alert.alert(
        "Listing marked as sold",
        selectedBuyer
          ? "A review request was sent in that chat."
          : "Listing marked as sold off app."
      );
    } catch (soldError) {
      console.error("Error marking mobile listing sold:", soldError);
      Alert.alert("Unable to mark sold", soldError.message || "Please try again.");
    } finally {
      setStatusUpdating(false);
    }
  }

  function confirmDeleteListing() {
    Alert.alert(
      "Delete listing?",
      `Permanently delete "${listing.title || "this listing"}"? This removes the listing and closes related conversations.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: deleteListing },
      ]
    );
  }

  async function deleteListing() {
    if (!listing?.id || !isOwnListing || deletingListing) return;

    setDeletingListing(true);
    try {
      const s3Keys = (listing.photos || []).map((photo) => photo.s3Key).filter(Boolean);
      if (s3Keys.length) {
        await deleteMultipleImages(s3Keys);
      }

      await closeListingConversationsForDeletedListing(
        listing.id,
        listing.userId,
        listing.title || "this listing"
      );
      await deleteDoc(doc(db, "listings", listing.id));
      Alert.alert("Listing deleted", "Your listing has been deleted.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (deleteError) {
      console.error("Error deleting mobile listing:", deleteError);
      Alert.alert("Unable to delete listing", deleteError.message || "Please try again.");
    } finally {
      setDeletingListing(false);
    }
  }

  function openReportModal() {
    if (!currentUser) {
      Alert.alert("Sign in required", "Sign in to report listings.");
      return;
    }

    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot report your own listing.");
      return;
    }

    setReportReason("");
    setReportDetails("");
    setReportOpen(true);
  }

  function closeReportModal() {
    if (submittingReport) return;
    setReportOpen(false);
    setReportReason("");
    setReportDetails("");
  }

  async function submitListingReport() {
    if (!currentUser?.uid || !listing?.id || !reportReason) return;

    setSubmittingReport(true);
    try {
      const now = new Date();
      await setDoc(doc(db, "listingReports", `${currentUser.uid}_${listing.id}`), {
        listingId: listing.id,
        listingTitle: listing.title || "",
        listingPhotoS3Key: listing.photos?.[0]?.s3Key || "",
        sellerId: listing.userId,
        reporterId: currentUser.uid,
        reporterName: `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
        reason: reportReason,
        details: reportDetails.trim(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      setReportOpen(false);
      setReportReason("");
      setReportDetails("");
      Alert.alert("Report submitted", "We will review this listing.");
    } catch (reportError) {
      console.error("Error submitting mobile listing report:", reportError);
      Alert.alert("Unable to submit report", reportError.message || "Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleToggleSavedListing() {
    if (!currentUser?.uid) {
      Alert.alert("Sign in required", "Sign in to save listings.");
      return;
    }

    if (!listing?.id || savingListingBookmark) return;

    setSavingListingBookmark(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        savedListings: isSavedListing
          ? arrayRemove(listing.id)
          : arrayUnion(listing.id),
      });
      Alert.alert(
        isSavedListing ? "Removed" : "Saved",
        isSavedListing
          ? "Removed from saved listings."
          : "Saved to your dashboard."
      );
    } catch (saveError) {
      console.error("Error updating mobile saved listing:", saveError);
      Alert.alert("Unable to save listing", saveError.message || "Please try again.");
    } finally {
      setSavingListingBookmark(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <PageState
          variant="loading"
          title="Loading listing"
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <PageState title="Unable to load listing" message={error} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <BackButton navigation={navigation} style={styles.topBackButton} />
          <View style={styles.topBarActions}>
            {!isOwnListing ? (
              <>
                <Pressable
                  style={[
                    styles.iconButton,
                    savingListingBookmark && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleToggleSavedListing}
                  disabled={savingListingBookmark}
                  accessibilityLabel={isSavedListing ? "Unsave listing" : "Save listing"}
                >
                  <MaterialIcons
                    name={isSavedListing ? "bookmark" : "bookmark-border"}
                    size={26}
                    color={colors.text}
                  />
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => setViewerActionsOpen(true)}
                  accessibilityLabel="Listing options"
                >
                  <MaterialIcons name="more-horiz" size={26} color={colors.text} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.heroFrame}>
          {activePhotoUrl ? (
            <Image source={{ uri: activePhotoUrl }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.imagePlaceholder]}>
              <Text style={styles.placeholderText}>No photo</Text>
            </View>
          )}
          {photos.length > 1 ? (
            <>
              <Pressable
                style={[styles.photoArrowButton, styles.photoArrowLeft]}
                onPress={handlePreviousPhoto}
                accessibilityLabel="Previous photo"
              >
                <MaterialIcons name="chevron-left" size={30} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.photoArrowButton, styles.photoArrowRight]}
                onPress={handleNextPhoto}
                accessibilityLabel="Next photo"
              >
                <MaterialIcons name="chevron-right" size={30} color="#fff" />
              </Pressable>
            </>
          ) : null}
        </View>

        {isOwnListing ? (
          <View style={styles.ownerActionBar}>
            <Pressable
              style={[
                styles.ownerPrimaryButton,
                statusUpdating && styles.primaryButtonDisabled,
              ]}
              onPress={
                listing.status === "sold"
                  ? () => confirmStatusChange("active")
                  : openMarkSoldModal
              }
              disabled={statusUpdating}
            >
              <Text style={styles.ownerPrimaryText}>
                {statusUpdating
                  ? "Updating..."
                  : listing.status === "sold"
                    ? "Mark Available"
                    : "Mark Sold"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.moreActionsButton, styles.ownerMoreActionsButton]}
              onPress={() => setOwnerActionsOpen(true)}
            >
              <Text style={styles.moreActionsText}>More actions</Text>
            </Pressable>
          </View>
        ) : null}

        {photos.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStrip}
          >
            {photos.map((photo, index) => {
              const thumbnailUrl = photo?.s3Key ? getS3PublicUrl(photo.s3Key) : null;
              const selected = index === photoIndex;
              return (
                <Pressable
                  key={photo.s3Key || `${listing.id}-photo-${index}`}
                  style={[
                    styles.photoThumbnailButton,
                    selected && styles.photoThumbnailButtonSelected,
                  ]}
                  onPress={() => setPhotoIndex(index)}
                  accessibilityLabel={`Show photo ${index + 1}`}
                >
                  {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} style={styles.photoThumbnail} />
                  ) : (
                    <View style={[styles.photoThumbnail, styles.thumbnailPlaceholder]}>
                      <Text style={styles.thumbnailPlaceholderText}>{index + 1}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.title}>{listing.title || "Untitled listing"}</Text>
          <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{listing.condition || "Condition not set"}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Fulfillment</Text>
          {fulfillmentOptions.length ? (
            <View style={styles.fulfillmentTabsSection}>
              <ScrollView
                horizontal
                style={styles.fulfillmentTabScroller}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.fulfillmentTabList}
              >
                {fulfillmentOptions.map((option) => {
                  const selected = selectedFulfillmentValue === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.fulfillmentTab,
                        selected && styles.fulfillmentTabSelected,
                      ]}
                      onPress={() => setActiveFulfillmentOption(option.value)}
                    >
                      <MaterialIcons
                        name={getFulfillmentIconName(option.value)}
                        size={16}
                        color={selected ? colors.primary : colors.muted}
                        style={styles.fulfillmentTabIcon}
                      />
                      <Text
                        style={[
                          styles.fulfillmentTabText,
                          selected && styles.fulfillmentTabTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {selectedFulfillmentValue === "shipping" ? (
                <View style={styles.fulfillmentInfoRow}>
                  <MaterialIcons name="local-shipping" size={18} color={colors.text} />
                  <Text style={styles.bodyText}>{formatShipping(listing)}</Text>
                </View>
              ) : null}

              {selectedFulfillmentValue === "local" ? (
                <View>
                  <View style={[styles.fulfillmentInfoRow, styles.fulfillmentDetailLine]}>
                    <MaterialIcons name="location-on" size={18} color={colors.text} />
                    <Text style={styles.bodyText}>
                      {listing.meetupLocationLabel || "Meetup area"}
                    </Text>
                  </View>
                  <ApproximateMeetupMap
                    location={listing.meetupLocation}
                    label={listing.meetupLocationLabel}
                  />
                </View>
              ) : null}

              {selectedFulfillmentValue === "competition" ? (
                <View>
                  {meetupCompetitionTags.length ? (
                    <View style={styles.competitionMeetupList}>
                      {meetupCompetitionTags.map((competition) => (
                        <Pressable
                          key={competition.id}
                          style={styles.competitionMeetupRow}
                          onPress={() => openCompetitionListings(competition)}
                        >
                          <MaterialIcons name="groups" size={18} color={colors.text} />
                          <View style={styles.competitionMeetupBody}>
                            <Text style={styles.competitionMeetupTitle} numberOfLines={1}>
                              {competition.displayName || competition.name || "Competition"}
                            </Text>
                            <Text style={styles.competitionMeetupMeta} numberOfLines={1}>
                              {[competition.city, competition.country, competition.dateRange]
                                .filter(Boolean)
                                .join(" · ") || "View competition listings"}
                            </Text>
                          </View>
                          <Text style={styles.competitionMeetupChevron}>›</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.fulfillmentInfoRow}>
                      <MaterialIcons name="groups" size={18} color={colors.text} />
                      <Text style={styles.bodyText}>Available at selected competitions.</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.bodyText}>Fulfillment options not set.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text
            style={styles.bodyText}
            numberOfLines={
              canExpandDescription && !descriptionExpanded
                ? DESCRIPTION_PREVIEW_LINES
                : undefined
            }
          >
            {descriptionText}
          </Text>
          {canExpandDescription ? (
            <Pressable
              style={styles.viewMoreButton}
              onPress={() => setDescriptionExpanded((current) => !current)}
            >
              <Text style={styles.viewMoreText}>
                {descriptionExpanded ? "View Less" : "View More..."}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {listing.userId && (
          <Pressable
            style={styles.sellerPanel}
            onPress={() => navigation.navigate("SellerProfile", { userId: listing.userId })}
          >
            {seller?.avatarUrl ? (
              <Image source={{ uri: seller.avatarUrl }} style={styles.sellerAvatarImage} />
            ) : (
              <View style={styles.sellerAvatar}>
                <Text style={styles.sellerAvatarText}>
                  {(seller?.firstName || seller?.displayName || "S").slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerLabel}>Seller</Text>
              <Text style={styles.sellerName} numberOfLines={1}>
                {seller?.displayName ||
                  `${seller?.firstName || ""} ${seller?.lastName || ""}`.trim() ||
                  "Seller profile"}
              </Text>
            </View>
          </Pressable>
        )}

        {!isOwnListing ? (
          <>
            <Pressable
              style={[
                styles.primaryButton,
                (creatingConversation ||
                  (isListingUnavailable && !existingConversation?.id)) &&
                  styles.primaryButtonDisabled,
              ]}
              onPress={handleMessageSeller}
              disabled={
                creatingConversation ||
                (isListingUnavailable && !existingConversation?.id)
              }
            >
              <Text style={styles.primaryButtonText}>
                {creatingConversation
                  ? "Opening..."
                  : existingConversation?.id
                    ? "Continue Chat"
                    : isListingUnavailable
                      ? listing.status === "archived"
                        ? "Pending"
                        : "Sold"
            : "Message seller"}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={editOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeEditListingModal}
      >
        <Screen>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.editKeyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.editContent}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editTitleRow}>
                <Text style={styles.editTitle}>Edit Listing</Text>
                <Pressable
                  style={styles.editCloseButton}
                  onPress={closeEditListingModal}
                  accessibilityLabel="Close edit listing"
                >
                  <MaterialIcons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>

              {editNotice ? (
                <View style={styles.editNotice}>
                  <Text style={styles.editNoticeText}>{editNotice}</Text>
                </View>
              ) : null}

              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>Basic Information</Text>

                <RequiredLabel>Title</RequiredLabel>
                <TextInput
                  value={editData.title}
                  onChangeText={handleEditTitleChange}
                  style={[styles.editInput, isEditTitleInvalid && styles.editInputError]}
                  placeholder="ex. Gan 16 Maglev UV"
                  maxLength={INPUT_LIMITS.LISTING_TITLE}
                />
                <HelperText error={isEditTitleInvalid}>
                  {isEditTitleInvalid ? "Enter a title." : ""}
                </HelperText>

                <View style={styles.editInlineFields}>
                  <View style={styles.editPriceField}>
                    <RequiredLabel>Price</RequiredLabel>
                    <View
                      style={[
                        styles.editCurrencyInputFrame,
                        isEditPriceInvalid && styles.editInputError,
                      ]}
                    >
                      <Text style={styles.editCurrencyPrefix}>$</Text>
                      <TextInput
                        value={editData.price}
                        onChangeText={handleEditPriceChange}
                        style={styles.editCurrencyTextInput}
                        keyboardType="number-pad"
                        placeholder="0.00"
                      />
                    </View>
                    <HelperText error={isEditPriceInvalid}>
                      {isEditPriceInvalid
                        ? `Enter a price from $0 to $${INPUT_LIMITS.LISTING_PRICE_MAX.toLocaleString()}.`
                        : ""}
                    </HelperText>
                  </View>
                </View>

                <SelectField
                  label="Puzzle Type"
                  required
                  value={editData.puzzleType}
                  placeholder="Select puzzle type"
                  error={isEditPuzzleTypeInvalid}
                  helperText={isEditPuzzleTypeInvalid ? "Select a puzzle type." : ""}
                  options={PUZZLE_TYPE_OPTIONS.map((option) => ({
                    value: option,
                    label: option,
                  }))}
                  onChange={(value) => {
                    clearEditNotice();
                    setEditData((current) => ({ ...current, puzzleType: value }));
                  }}
                />

                <SelectField
                  label="Condition"
                  required
                  value={editData.condition}
                  placeholder="Select condition"
                  error={isEditConditionInvalid}
                  helperText={isEditConditionInvalid ? "Select a condition." : ""}
                  options={CONDITION_OPTIONS}
                  onChange={(value) => {
                    clearEditNotice();
                    setEditData((current) => ({ ...current, condition: value }));
                  }}
                />

                <RequiredLabel>Description</RequiredLabel>
                <TextInput
                  value={editData.description}
                  onChangeText={handleEditDescriptionChange}
                  style={[
                    styles.editInput,
                    styles.editTextArea,
                    isEditDescriptionInvalid && styles.editInputError,
                  ]}
                  maxLength={INPUT_LIMITS.LISTING_DESCRIPTION}
                  multiline
                  placeholder="Describe your cube's condition, features, and any included accessories..."
                  textAlignVertical="top"
                />
                <HelperText error={isEditDescriptionInvalid}>
                  {isEditDescriptionInvalid
                    ? "Enter a description."
                    : characterCountText(
                        editData.description,
                        INPUT_LIMITS.LISTING_DESCRIPTION
                      )}
                </HelperText>
              </View>

              <View style={[styles.editSection, styles.editSectionBorder]}>
                <Text style={styles.editSectionTitle}>Fulfillment Methods</Text>

                <View style={styles.editSwitchRow}>
                  <Text style={styles.editSwitchLabel}>Shipping</Text>
                  <Toggle
                    value={editData.shippingAvailable}
                    onValueChange={(value) => {
                      clearEditNotice();
                      setEditData((current) => ({
                        ...current,
                        shippingAvailable: value,
                        shippingCost: value ? current.shippingCost : "0.00",
                      }));
                    }}
                  />
                </View>
                {editData.shippingAvailable ? (
                  <View style={styles.editNestedSection}>
                    <RequiredLabel>Shipping Price</RequiredLabel>
                    <View
                      style={[
                        styles.editCurrencyInputFrame,
                        styles.editShippingInput,
                        !isEditShippingCostValid && styles.editInputError,
                      ]}
                    >
                      <Text style={styles.editCurrencyPrefix}>$</Text>
                      <TextInput
                        value={editData.shippingCost}
                        onChangeText={handleEditShippingCostChange}
                        style={styles.editCurrencyTextInput}
                        keyboardType="number-pad"
                        placeholder="0.00"
                      />
                    </View>
                    <HelperText error={!isEditShippingCostValid && hasAttemptedEditSave}>
                      {!isEditShippingCostValid && hasAttemptedEditSave
                        ? `Enter a shipping price from $0 to $${INPUT_LIMITS.SHIPPING_COST_MAX}.`
                        : "Keep at $0 if there is no additional shipping cost."}
                    </HelperText>
                  </View>
                ) : null}

                <View style={styles.editSwitchRow}>
                  <Text style={styles.editSwitchLabel}>Local Meetup</Text>
                  <Toggle
                    value={editData.localMeetupAvailable}
                    onValueChange={handleEditLocalMeetupChange}
                  />
                </View>
                {editData.localMeetupAvailable ? (
                  <View style={styles.editNestedSection}>
                    <RequiredLabel>General Meetup Area</RequiredLabel>
                    <ClearableTextInput
                      value={editData.meetupLocationLabel}
                      onChangeText={(value) => {
                        clearEditNotice();
                        setHasEditedLocationSearch(true);
                        const nextValue = clampText(value, INPUT_LIMITS.LOCATION_LABEL);
                        setEditData((current) => ({
                          ...current,
                          meetupLocationLabel: nextValue,
                          meetupLocation:
                            nextValue === current.meetupLocation?.label
                              ? current.meetupLocation
                              : null,
                        }));
                      }}
                      style={[
                        styles.editInput,
                        hasAttemptedEditSave &&
                          !isEditMeetupLocationValid &&
                          styles.editInputError,
                      ]}
                      placeholder="ex. Los Angeles, CA"
                      clearAccessibilityLabel="Clear meetup location"
                    />
                    {loadingEditLocations ? (
                      <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
                    ) : null}
                    {editLocationOptions.length > 0 ? (
                      <View style={styles.editOptionList}>
                        {editLocationOptions.map((option) => {
                          const selected = editData.meetupLocation?.label === option.label;
                          return (
                            <Pressable
                              key={option.label}
                              style={[
                                styles.editInlineOption,
                                selected && styles.editInlineOptionSelected,
                              ]}
                              onPress={() => {
                                clearEditNotice();
                                setEditData((current) => ({
                                  ...current,
                                  meetupLocation: option,
                                  meetupLocationLabel: getLocationOptionLabel(option),
                                }));
                                setEditLocationOptions([]);
                                setHasEditedLocationSearch(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.editInlineOptionText,
                                  selected && styles.editInlineOptionTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    <HelperText error={hasAttemptedEditSave && !isEditMeetupLocationValid}>
                      {hasAttemptedEditSave && !isEditMeetupLocationValid
                        ? "Select a location from the list."
                        : ""}
                    </HelperText>
                  </View>
                ) : null}

                <View style={styles.editSwitchRow}>
                  <Text style={styles.editSwitchLabel}>Competition Meetup</Text>
                  <Toggle
                    value={editData.competitionMeetupAvailable}
                    onValueChange={handleEditCompetitionMeetupChange}
                  />
                </View>
                {editData.competitionMeetupAvailable ? (
                  <View style={styles.editCompetitionSection}>
                    <RequiredLabel>Competitions</RequiredLabel>
                    <ClearableTextInput
                      value={editCompetitionSearchInput}
                      onChangeText={(value) => {
                        clearEditNotice();
                        setEditCompetitionDropdownOpen(true);
                        setHasEditedCompetitionSearch(true);
                        setEditCompetitionSearchInput(value);
                      }}
                      style={[
                        styles.editInput,
                        hasAttemptedEditSave &&
                          !isEditCompetitionValid &&
                          styles.editInputError,
                      ]}
                      placeholder="Search competitions..."
                      clearAccessibilityLabel="Clear competition search"
                      onFocus={() => {
                        setEditCompetitionDropdownOpen(true);
                        setHasEditedCompetitionSearch(true);
                      }}
                    />
                    {loadingEditCompetitions ? (
                      <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
                    ) : null}
                    {selectedEditCompetitions.length > 0 ? (
                      <View style={styles.editSelectedCompetitionWrap}>
                        {selectedEditCompetitions.map((competition) => (
                          <Pressable
                            key={competition.id}
                            style={styles.editSelectedCompetitionPill}
                            onPress={() => handleEditCompetitionSelect(competition)}
                          >
                            <Text style={styles.editSelectedCompetitionText} numberOfLines={1}>
                              {competition.displayName || competition.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {editCompetitionDropdownOpen ? (
                      <View style={styles.editCompetitionDropdown}>
                        {editCompetitionOptions.length > 0 ? (
                          <ScrollView
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                            style={styles.editCompetitionDropdownScroll}
                          >
                            {editCompetitionOptions.map((competition) => {
                              const selected = selectedEditCompetitionIds.has(competition.id);
                              return (
                                <Pressable
                                  key={competition.id}
                                  style={[
                                    styles.editCompetitionOption,
                                    selected && styles.editInlineOptionSelected,
                                  ]}
                                  onPress={() => handleEditCompetitionSelect(competition)}
                                >
                                  <View style={styles.editCompetitionOptionHeader}>
                                    {competition.isMyCompetitionsOption ? (
                                      <MaterialIcons
                                        name="bookmark-border"
                                        size={18}
                                        color={selected ? colors.primary : colors.text}
                                      />
                                    ) : null}
                                    <Text
                                      style={[
                                        styles.editCompetitionOptionTitle,
                                        selected && styles.editInlineOptionTextSelected,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {competition.displayName || competition.name}
                                    </Text>
                                  </View>
                                  <Text style={styles.editCompetitionOptionMeta} numberOfLines={1}>
                                    {competition.isMyCompetitionsOption
                                      ? `Add all ${bookmarkedCompetitions.length} bookmarked competitions`
                                      : [competition.city, competition.country, competition.dateRange]
                                          .filter(Boolean)
                                          .join(" · ")}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        ) : (
                          <Text style={styles.editCompetitionDropdownEmpty}>
                            {loadingEditCompetitions
                              ? "Loading competitions..."
                              : "No competitions found."}
                          </Text>
                        )}
                      </View>
                    ) : null}
                    {editCompetitionDropdownOpen && editCompetitions.length >= editCompetitionLimit ? (
                      <Pressable
                        style={styles.editLoadMoreButton}
                        onPress={() =>
                          setEditCompetitionLimit(
                            (currentLimit) => currentLimit + COMPETITION_BATCH_SIZE
                          )
                        }
                      >
                        <Text style={styles.editLoadMoreText}>Load more competitions</Text>
                      </Pressable>
                    ) : null}
                    <HelperText error={hasAttemptedEditSave && !isEditCompetitionValid}>
                      {hasAttemptedEditSave && !isEditCompetitionValid
                        ? "Select at least one competition."
                        : ""}
                    </HelperText>
                  </View>
                ) : null}

                {!isEditDeliveryValid && hasAttemptedEditSave ? (
                  <HelperText error>Select at least one fulfillment method.</HelperText>
                ) : null}
              </View>

              <View style={styles.editActionRow}>
                <Pressable
                  style={styles.editCancelButton}
                  onPress={closeEditListingModal}
                  disabled={savingEdit}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.editSaveButton, savingEdit && styles.primaryButtonDisabled]}
                  onPress={saveListingEdits}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.editSaveText}>Save Changes</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Screen>
      </Modal>

      <ActionSheet
        visible={ownerActionsOpen}
        title="Listing actions"
        onClose={() => setOwnerActionsOpen(false)}
        actions={[
          {
            label: "Edit Listing",
            disabled: statusUpdating || deletingListing,
            onPress: openEditListingModal,
          },
          ...(listing.status !== "sold"
            ? [
                {
                  label: listing.status === "archived" ? "Mark Available" : "Mark Pending",
                  disabled: statusUpdating,
                  onPress: () =>
                    confirmStatusChange(listing.status === "archived" ? "active" : "archived"),
                },
              ]
            : []),
          {
            label: deletingListing ? "Deleting..." : "Delete Listing",
            destructive: true,
            disabled: deletingListing || statusUpdating,
            onPress: confirmDeleteListing,
          },
        ]}
      />

      <ActionSheet
        visible={viewerActionsOpen}
        onClose={() => setViewerActionsOpen(false)}
        showCancel={false}
        showCloseButton
        actions={[
          {
            label: "Report listing",
            onPress: openReportModal,
          },
        ]}
      />

      <Modal visible={messageDraftOpen} transparent animationType="fade" onRequestClose={closeMessageDraftModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Message seller</Text>
            <Text style={styles.modalBody}>
              Send a first message to start a conversation about this listing.
            </Text>
            <Text style={styles.modalLabel}>Message</Text>
            <TextInput
              value={initialMessageDraft}
              onChangeText={(value) => setInitialMessageDraft(value.slice(0, 500))}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder={getDefaultInitialMessage()}
              maxLength={500}
              multiline
              editable={!creatingConversation}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeMessageDraftModal}
                disabled={creatingConversation}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  (!initialMessageDraft.trim() || creatingConversation) &&
                    styles.modalSubmitButtonDisabled,
                ]}
                onPress={sendInitialMessage}
                disabled={!initialMessageDraft.trim() || creatingConversation}
              >
                <Text style={styles.modalSubmitText}>
                  {creatingConversation ? "Sending..." : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={closeReportModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report listing</Text>
            <Text style={styles.modalBody}>
              Reports help WeCube review suspicious, unsafe, misleading, or inappropriate listings.
            </Text>
            <Text style={styles.modalLabel}>Reason</Text>
            <View style={styles.reasonList}>
              {LISTING_REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.reasonOption,
                    reportReason === reason.value && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setReportReason(reason.value)}
                  disabled={submittingReport}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      reportReason === reason.value && styles.reasonTextSelected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalLabel}>Details</Text>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Add context for the admin review"
              maxLength={1000}
              multiline
              editable={!submittingReport}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeReportModal}
                disabled={submittingReport}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  (!reportReason || submittingReport) && styles.modalSubmitButtonDisabled,
                ]}
                onPress={submitListingReport}
                disabled={!reportReason || submittingReport}
              >
                <Text style={styles.modalSubmitText}>
                  {submittingReport ? "Submitting..." : "Submit"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={markSoldOpen} transparent animationType="fade" onRequestClose={closeMarkSoldModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark Listing as Sold</Text>
            <Text style={styles.modalBody}>
              Choose how this sale happened before marking the listing sold.
            </Text>
            <View style={styles.soldMethodRow}>
              {[
                { value: "in_app", label: "Sold in app" },
                { value: "off_app", label: "Sold off app" },
              ].map((option) => {
                const selected = soldMethodChoice === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.soldMethodButton,
                      selected && styles.soldMethodButtonSelected,
                    ]}
                    onPress={() => {
                      setSoldMethodChoice(option.value);
                      if (option.value === "off_app") {
                        setSelectedBuyerConversationId("");
                      }
                    }}
                    disabled={statusUpdating}
                  >
                    <Text
                      style={[
                        styles.soldMethodText,
                        selected && styles.soldMethodTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {loadingBuyerOptions ? (
              <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
            ) : soldMethodChoice === "in_app" && buyerOptions.length > 0 ? (
              <View style={styles.buyerList}>
                <Text style={styles.buyerListLabel}>Choose who bought the puzzle.</Text>
                {buyerOptions.map((buyer) => (
                  <Pressable
                    key={buyer.conversationId}
                    style={[
                      styles.buyerOption,
                      selectedBuyerConversationId === buyer.conversationId &&
                        styles.buyerOptionSelected,
                    ]}
                    onPress={() => setSelectedBuyerConversationId(buyer.conversationId)}
                    disabled={statusUpdating}
                  >
                    <View style={styles.buyerOptionRadio}>
                      {selectedBuyerConversationId === buyer.conversationId ? (
                        <View style={styles.buyerOptionRadioDot} />
                      ) : null}
                    </View>
                    <View style={styles.buyerOptionCopy}>
                      <Text style={styles.buyerName}>{buyer.buyerName}</Text>
                      <Text style={styles.buyerMeta} numberOfLines={1}>
                        {buyer.lastMessage || buyer.buyerEmail || "Buyer chat"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : soldMethodChoice === "in_app" ? (
              <Text style={styles.emptyModalText}>
                No buyer chats were found. Choose sold off app if this sale happened outside WeCube.
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeMarkSoldModal}
                disabled={statusUpdating}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  (statusUpdating ||
                    (soldMethodChoice === "in_app" &&
                      (loadingBuyerOptions || !selectedBuyerConversationId))) &&
                    styles.modalSubmitButtonDisabled,
                ]}
                onPress={confirmMarkSoldSelection}
                disabled={
                  statusUpdating ||
                  (soldMethodChoice === "in_app" &&
                    (loadingBuyerOptions || !selectedBuyerConversationId))
                }
              >
                <Text style={styles.modalSubmitText}>
                  {statusUpdating ? "Saving..." : "Mark as Sold"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 20,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  topBackButton: {
    marginBottom: 0,
  },
  topBarActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  heroFrame: {
    aspectRatio: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: radii.card,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    ...typography.caption,
    color: colors.muted,
  },
  photoArrowButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -22 }],
    width: 44,
  },
  photoArrowLeft: {
    left: 10,
  },
  photoArrowRight: {
    right: 10,
  },
  thumbnailStrip: {
    gap: 8,
    paddingTop: 10,
  },
  photoThumbnailButton: {
    borderColor: "transparent",
    borderRadius: radii.control,
    borderWidth: 2,
    height: 48,
    overflow: "hidden",
    width: 48,
  },
  photoThumbnailButtonSelected: {
    borderColor: colors.text,
  },
  photoThumbnail: {
    height: "100%",
    width: "100%",
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
  },
  thumbnailPlaceholderText: {
    ...typography.caption,
    color: colors.muted,
  },
  panel: {
    marginTop: 14,
  },
  title: {
    fontFamily: typography.screenTitle.fontFamily,
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29,
  },
  price: {
    fontFamily: typography.listingPrice.fontFamily,
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.muted,
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "capitalize",
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    marginBottom: 8,
  },
  fulfillmentTabsSection: {
    gap: 12,
  },
  fulfillmentTabScroller: {
    alignSelf: "center",
    maxWidth: "100%",
  },
  fulfillmentTabList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    gap: 6,
    justifyContent: "center",
    padding: 6,
  },
  fulfillmentTab: {
    alignItems: "center",
    borderRadius: radii.control,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8,
    width: 112,
  },
  fulfillmentTabIcon: {
    flexShrink: 0,
  },
  fulfillmentTabSelected: {
    backgroundColor: colors.primarySoft,
  },
  fulfillmentTabText: {
    ...typography.caption,
    color: colors.muted,
  },
  fulfillmentTabTextSelected: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily,
    fontWeight: "700",
  },
  fulfillmentDetailLine: {
    marginBottom: 8,
  },
  fulfillmentInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  bodyText: {
    ...typography.body,
    color: colors.text,
  },
  viewMoreButton: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  viewMoreText: {
    ...typography.button,
    color: colors.text,
  },
  competitionMeetupList: {
    marginTop: 2,
  },
  competitionMeetupRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    paddingVertical: 9,
  },
  competitionMeetupBody: {
    flex: 1,
    minWidth: 0,
  },
  competitionMeetupTitle: {
    ...typography.caption,
    color: colors.text,
  },
  competitionMeetupMeta: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  competitionMeetupChevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: "700",
  },
  sellerPanel: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
  },
  sellerAvatar: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  sellerAvatarImage: {
    backgroundColor: "#e2e8f0",
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  sellerAvatarText: {
    fontFamily: typography.button.fontFamily,
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  sellerInfo: {
    flex: 1,
  },
  sellerLabel: {
    ...typography.caption,
    color: colors.muted,
    textTransform: "uppercase",
  },
  sellerName: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: 2,
  },
  ownerActionBar: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  ownerPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  ownerPrimaryText: {
    ...typography.button,
    color: "#fff",
  },
  moreActionsButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  ownerMoreActionsButton: {
    marginTop: 0,
  },
  moreActionsText: {
    ...typography.button,
    color: colors.text,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    marginTop: 16,
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#fff",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    maxHeight: "86%",
    padding: 18,
    width: "100%",
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  modalBody: {
    ...typography.body,
    color: colors.muted,
    marginTop: 8,
  },
  modalLabel: {
    ...typography.caption,
    color: colors.text,
    marginTop: 14,
  },
  reasonList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  reasonOption: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonText: {
    ...typography.caption,
    color: colors.text,
  },
  reasonTextSelected: {
    color: "#fff",
  },
  modalInput: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: 15,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalTextArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  modalCancelButton: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    ...typography.button,
    color: colors.text,
  },
  modalSubmitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.45,
  },
  modalSubmitText: {
    ...typography.button,
    color: "#fff",
  },
  inlineLoader: {
    marginTop: 16,
  },
  soldMethodRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  soldMethodButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  soldMethodButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  soldMethodText: {
    ...typography.button,
    color: colors.text,
    textAlign: "center",
  },
  soldMethodTextSelected: {
    color: "#fff",
  },
  buyerList: {
    gap: 8,
    marginTop: 14,
  },
  buyerListLabel: {
    ...typography.caption,
    color: colors.muted,
  },
  buyerOption: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buyerOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  buyerOptionRadio: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  buyerOptionRadioDot: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  buyerOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  buyerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  buyerMeta: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 4,
  },
  emptyModalText: {
    ...typography.body,
    color: colors.muted,
    marginTop: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  editKeyboardView: {
    flex: 1,
  },
  editContent: {
    padding: 16,
    paddingBottom: 32,
    paddingTop: 72,
  },
  editTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  editTitle: {
    ...typography.screenTitle,
    color: colors.text,
    flex: 1,
  },
  editCloseButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  editNotice: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  editNoticeText: {
    ...typography.caption,
    color: colors.danger,
  },
  editSection: {
    paddingVertical: 6,
  },
  editSectionBorder: {
    borderColor: colors.border,
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 22,
  },
  editSectionTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: 6,
  },
  editLabel: {
    ...typography.caption,
    color: colors.text,
    marginTop: 16,
  },
  required: {
    color: colors.danger,
  },
  editHelper: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 5,
  },
  editErrorText: {
    color: colors.danger,
    fontWeight: "700",
  },
  editInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editInputError: {
    borderColor: colors.danger,
  },
  editInlineFields: {
    flexDirection: "row",
    gap: 12,
  },
  editPriceField: {
    width: 118,
  },
  editCurrencyInputFrame: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editCurrencyPrefix: {
    fontFamily: typography.bodyStrong.fontFamily,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },
  editCurrencyTextInput: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: 16,
    lineHeight: 20,
    minWidth: 0,
    padding: 0,
  },
  editSelectInput: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  editSelectText: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
  },
  editPlaceholderText: {
    color: colors.muted,
    fontWeight: "500",
  },
  editTextArea: {
    minHeight: 118,
  },
  editSwitchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  editSwitchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  editNestedSection: {
    marginBottom: 12,
    marginTop: 2,
    paddingBottom: 4,
  },
  editShippingInput: {
    width: 180,
  },
  editOptionList: {
    gap: 8,
    marginTop: 10,
  },
  editCompetitionDropdown: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  editCompetitionDropdownScroll: {
    maxHeight: 260,
  },
  editCompetitionDropdownEmpty: {
    ...typography.caption,
    color: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  editInlineOption: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editInlineOptionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  editInlineOptionText: {
    ...typography.caption,
    color: colors.text,
  },
  editInlineOptionTextSelected: {
    color: colors.primary,
  },
  editCompetitionSection: {
    marginTop: 4,
  },
  editSelectedCompetitionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  editSelectedCompetitionPill: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
    borderRadius: radii.control,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editSelectedCompetitionText: {
    ...typography.caption,
    color: colors.primary,
  },
  editCompetitionOption: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 11,
  },
  editCompetitionOptionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  editCompetitionOptionTitle: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  editCompetitionOptionMeta: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 3,
  },
  editLoadMoreButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 10,
  },
  editLoadMoreText: {
    ...typography.caption,
    color: colors.primary,
  },
  editActionRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 18,
  },
  editCancelButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  editCancelText: {
    ...typography.button,
    color: colors.text,
  },
  editSaveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  editSaveText: {
    ...typography.button,
    color: "#fff",
  },
  selectBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    flex: 1,
    justifyContent: "flex-end",
  },
  selectPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "82%",
    padding: 18,
  },
  selectHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  selectCloseButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  selectOption: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  selectOptionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  selectOptionText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  selectOptionTextSelected: {
    color: colors.primary,
  },
});
