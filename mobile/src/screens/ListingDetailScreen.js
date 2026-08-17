import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import PageState from "../components/PageState";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { radii, typography } from "../theme/design";
import { formatListingPrice, getCompetitionTags } from "../utils/listingUtils";
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

function formatShipping(listing) {
  if (!listing?.shippingAvailable) return null;
  if (listing.shippingIncluded || Number(listing.shippingCost || 0) === 0) {
    return "Free shipping";
  }
  return `+${formatListingPrice(listing.shippingCost)} shipping`;
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
  const [deletingListing, setDeletingListing] = useState(false);
  const [ownerActionsOpen, setOwnerActionsOpen] = useState(false);
  const [viewerActionsOpen, setViewerActionsOpen] = useState(false);
  const [activeFulfillmentOption, setActiveFulfillmentOption] = useState("");

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

  const photos = listing?.photos || [];
  const activePhoto = photos[photoIndex];
  const activePhotoUrl = activePhoto?.s3Key ? getS3PublicUrl(activePhoto.s3Key) : null;
  const meetupCompetitionTags = useMemo(() => getCompetitionTags(listing), [listing]);
  const isOwnListing = currentUser?.uid && currentUser.uid === listing?.userId;
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

  function openCompetitionListings(competition) {
    if (!competition?.id) return;

    navigation.getParent()?.navigate("Competitions", {
      screen: "CompetitionListings",
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
            {listing.puzzleType ? <Text style={styles.metaPill}>{listing.puzzleType}</Text> : null}
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
                <Text style={styles.bodyText}>{formatShipping(listing)}</Text>
              ) : null}

              {selectedFulfillmentValue === "local" ? (
                <View>
                  <Text style={[styles.bodyText, styles.fulfillmentDetailLine]}>
                    {listing.meetupLocationLabel || "Meetup area"}
                  </Text>
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
                    <Text style={styles.bodyText}>Available at selected competitions.</Text>
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

      <ActionSheet
        visible={ownerActionsOpen}
        title="Listing actions"
        onClose={() => setOwnerActionsOpen(false)}
        actions={[
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
              Select the buyer if this sale happened through a WeCube chat, or mark it sold off app.
            </Text>
            {loadingBuyerOptions ? (
              <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
            ) : buyerOptions.length > 0 ? (
              <View style={styles.buyerList}>
                {buyerOptions.map((buyer) => (
                  <Pressable
                    key={buyer.conversationId}
                    style={styles.buyerOption}
                    onPress={() => markListingSold(buyer)}
                    disabled={statusUpdating}
                  >
                    <Text style={styles.buyerName}>{buyer.buyerName}</Text>
                    <Text style={styles.buyerMeta} numberOfLines={1}>
                      {buyer.lastMessage || buyer.buyerEmail || "Buyer chat"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyModalText}>
                No buyer chats were found.
              </Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeMarkSoldModal}
                disabled={statusUpdating}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmitButton, statusUpdating && styles.modalSubmitButtonDisabled]}
                onPress={() => markListingSold(null)}
                disabled={statusUpdating}
              >
                <Text style={styles.modalSubmitText}>
                  {statusUpdating ? "Saving..." : "Sold Off App"}
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
    paddingBottom: 32,
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
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8,
    width: 112,
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
  buyerList: {
    gap: 8,
    marginTop: 14,
  },
  buyerOption: {
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
});
