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
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { formatListingPrice } from "../utils/listingUtils";
import { createConversation, getUserProfile } from "../utils/messaging";
import { getS3PublicUrl } from "../utils/s3";

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
  if (listing?.competitionMeetupAvailable) options.push("Competition meetup");
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

  const photos = listing?.photos || [];
  const activePhoto = photos[photoIndex];
  const activePhotoUrl = activePhoto?.s3Key ? getS3PublicUrl(activePhoto.s3Key) : null;
  const fulfillmentOptions = useMemo(() => formatFulfillment(listing), [listing]);
  const isOwnListing = currentUser?.uid && currentUser.uid === listing?.userId;

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

      closeReportModal();
      Alert.alert("Report submitted", "We will review this listing.");
    } catch (reportError) {
      console.error("Error submitting mobile listing report:", reportError);
      Alert.alert("Unable to submit report", reportError.message || "Please try again.");
    } finally {
      setSubmittingReport(false);
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
          style={[styles.primaryButton, creatingConversation && styles.primaryButtonDisabled]}
          onPress={handleMessageSeller}
          disabled={creatingConversation}
        >
          <Text style={styles.primaryButtonText}>
            {creatingConversation ? "Opening..." : isOwnListing ? "Your listing" : "Message seller"}
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
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
