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
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { formatListingPrice } from "../utils/listingUtils";
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

function formatShipping(listing) {
  if (!listing?.shippingAvailable) return null;
  if (listing.shippingIncluded || Number(listing.shippingCost || 0) === 0) {
    return "Shipping: free";
  }
  return `Shipping: +${formatListingPrice(listing.shippingCost)}`;
}

function formatFulfillment(listing) {
  const options = [];
  if (listing?.shippingAvailable) options.push(formatShipping(listing));
  if (listing?.localMeetupAvailable) options.push("Local meetup");
  if (listing?.competitionMeetupAvailable) {
    const competitionTags = [
      ...(listing.meetupCompetitionTags || []),
      ...(listing.competitions || []),
    ];
    const uniqueCompetitions = competitionTags.filter(
      (competition, index, allCompetitions) =>
        competition?.id &&
        allCompetitions.findIndex((item) => item.id === competition.id) === index
    );

    if (uniqueCompetitions.length > 0) {
      uniqueCompetitions.forEach((competition) => {
        options.push(
          `Competition meetup: ${competition.displayName || competition.name || "Competition"}`
        );
      });
    } else {
      options.push("Competition meetup");
    }
  }
  return options.filter(Boolean);
}

export default function ListingDetailScreen({ navigation, route }) {
  const { currentUser } = useAuth();
  const { listingId } = route.params || {};
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [seller, setSeller] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [savingListingBookmark, setSavingListingBookmark] = useState(false);
  const [existingConversation, setExistingConversation] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);
  const [loadingBuyerOptions, setLoadingBuyerOptions] = useState(false);
  const [deletingListing, setDeletingListing] = useState(false);

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
  const fulfillmentOptions = useMemo(() => formatFulfillment(listing), [listing]);
  const isOwnListing = currentUser?.uid && currentUser.uid === listing?.userId;
  const isSavedListing = Boolean(currentUser?.savedListings?.includes(listing?.id));
  const sellerFirstName =
    `${seller?.firstName || ""}`.trim() ||
    `${seller?.displayName || ""}`.trim().split(/\s+/)[0] ||
    "Seller";
  const isListingUnavailable =
    listing?.status === "sold" || listing?.status === "archived";

  function handlePreviousPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  }

  function handleNextPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  }

  async function handleMessageSeller() {
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

    setCreatingConversation(true);
    try {
      const conversationId = await createConversation({
        listingId: listing.id,
        sellerId: listing.userId,
        buyerId: currentUser.uid,
        initialMessage: `Hi, I'm interested in ${listing.title || "this listing"}.`,
      });
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
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {activePhotoUrl ? (
          <Image source={{ uri: activePhotoUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No photo</Text>
          </View>
        )}

        {isOwnListing ? (
          <View style={styles.ownerActions}>
            {listing.status === "sold" ? (
              <Pressable
                style={[styles.ownerPrimaryButton, statusUpdating && styles.primaryButtonDisabled]}
                onPress={() => confirmStatusChange("active")}
                disabled={statusUpdating}
              >
                <Text style={styles.ownerPrimaryText}>
                  {statusUpdating ? "Updating..." : "Mark Available"}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.ownerPrimaryButton, statusUpdating && styles.primaryButtonDisabled]}
                onPress={openMarkSoldModal}
                disabled={statusUpdating}
              >
                <Text style={styles.ownerPrimaryText}>
                  {statusUpdating ? "Updating..." : "Mark Sold"}
                </Text>
              </Pressable>
            )}
            {listing.status !== "sold" ? (
              <Pressable
                style={styles.ownerSecondaryButton}
                onPress={() =>
                  confirmStatusChange(listing.status === "archived" ? "active" : "archived")
                }
                disabled={statusUpdating}
              >
                <Text style={styles.ownerSecondaryText}>
                  {listing.status === "archived" ? "Mark Available" : "Mark Pending"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.ownerDeleteButton}
              onPress={confirmDeleteListing}
              disabled={deletingListing || statusUpdating}
            >
              <Text style={styles.ownerDeleteText}>
                {deletingListing ? "Deleting..." : "Delete Listing"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {photos.length > 1 && (
          <View style={styles.photoControls}>
            <Pressable style={styles.photoButton} onPress={handlePreviousPhoto}>
              <Text style={styles.photoButtonText}>Previous</Text>
            </Pressable>
            <Text style={styles.photoCount}>
              {photoIndex + 1} / {photos.length}
            </Text>
            <Pressable style={styles.photoButton} onPress={handleNextPhoto}>
              <Text style={styles.photoButtonText}>Next</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.title}>{listing.title || "Untitled listing"}</Text>
          <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
          {!isOwnListing ? (
            <Pressable
              style={[styles.saveListingButton, savingListingBookmark && styles.primaryButtonDisabled]}
              onPress={handleToggleSavedListing}
              disabled={savingListingBookmark}
            >
              <Text style={styles.saveListingText}>
                {savingListingBookmark
                  ? "Saving..."
                  : isSavedListing
                    ? "Saved listing"
                    : "Save listing"}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{listing.condition || "Condition not set"}</Text>
            {listing.puzzleType ? <Text style={styles.metaPill}>{listing.puzzleType}</Text> : null}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Fulfillment</Text>
          {fulfillmentOptions.length ? (
            fulfillmentOptions.map((option) => (
              <Text key={option} style={styles.bodyText}>
                {option}
              </Text>
            ))
          ) : (
            <Text style={styles.bodyText}>Fulfillment options not set.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.bodyText}>
            {listing.description || "No description provided."}
          </Text>
        </View>

        {listing.userId && (
          <Pressable
            style={styles.sellerPanel}
            onPress={() => navigation.navigate("SellerProfile", { userId: listing.userId })}
          >
            <View style={styles.sellerAvatar}>
              <Text style={styles.sellerAvatarText}>
                {(seller?.firstName || seller?.displayName || "S").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerLabel}>Seller</Text>
              <Text style={styles.sellerName} numberOfLines={1}>
                {seller?.displayName ||
                  `${seller?.firstName || ""} ${seller?.lastName || ""}`.trim() ||
                  "Seller profile"}
              </Text>
            </View>
            <Text style={styles.sellerAction}>View</Text>
          </Pressable>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            (creatingConversation ||
              isOwnListing ||
              (isListingUnavailable && !existingConversation?.id)) &&
              styles.primaryButtonDisabled,
          ]}
          onPress={handleMessageSeller}
          disabled={
            creatingConversation ||
            isOwnListing ||
            (isListingUnavailable && !existingConversation?.id)
          }
        >
          <Text style={styles.primaryButtonText}>
            {creatingConversation
              ? "Opening..."
              : isOwnListing
                ? "Your listing"
                : existingConversation?.id
                  ? "Continue Chat"
                  : isListingUnavailable
                    ? listing.status === "archived"
                      ? "Pending"
                      : "Sold"
                    : "Message seller"}
          </Text>
        </Pressable>
        {!isOwnListing && (
          <Pressable style={styles.reportButton} onPress={openReportModal}>
            <Text style={styles.reportText}>Report listing</Text>
          </Pressable>
        )}
      </ScrollView>

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
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  heroImage: {
    aspectRatio: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  photoControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  photoButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  photoButtonText: {
    color: colors.primary,
    fontWeight: "800",
  },
  photoCount: {
    color: colors.muted,
    fontWeight: "700",
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  price: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
  },
  saveListingButton: {
    alignSelf: "flex-start",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveListingText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
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
    borderRadius: 6,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "capitalize",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 8,
  },
  bodyText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  sellerPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    padding: 12,
  },
  sellerAvatar: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  sellerAvatarText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  sellerInfo: {
    flex: 1,
  },
  sellerLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sellerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  sellerAction: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  ownerActions: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 14,
  },
  ownerPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 46,
  },
  ownerPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  ownerSecondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  ownerSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  ownerDeleteButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  ownerDeleteText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 16,
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  reportButton: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
  reportText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
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
    borderRadius: 8,
    maxHeight: "86%",
    padding: 18,
    width: "100%",
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  modalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  modalLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
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
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  reasonTextSelected: {
    color: "#fff",
  },
  modalInput: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
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
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: colors.text,
    fontWeight: "800",
  },
  modalSubmitButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.45,
  },
  modalSubmitText: {
    color: "#fff",
    fontWeight: "800",
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
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buyerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  buyerMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  emptyModalText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
