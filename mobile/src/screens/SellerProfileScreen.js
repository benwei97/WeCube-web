import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { formatListingPrice, getDateTime } from "../utils/listingUtils";
import { blockUser, subscribeToUserBlock, unblockUser } from "../utils/messaging";
import { getS3PublicUrl } from "../utils/s3";

const USER_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abuse" },
  { value: "fake_identity", label: "Fake identity" },
  { value: "suspicious_activity", label: "Suspicious activity" },
  { value: "other", label: "Other" },
];

function getDisplayName(profile) {
  return (
    profile?.displayName ||
    `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() ||
    "WeCube user"
  );
}

function getJoinedDate(profile) {
  const createdAt = profile?.createdAt;
  const timestamp = getDateTime(createdAt);
  if (!timestamp) return "Joined date unavailable";
  return `Joined ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp))}`;
}

function SellerListingRow({ listing, onPress }) {
  const thumbnailUrl = listing.photos?.[0]?.s3Key
    ? getS3PublicUrl(listing.photos[0].s3Key)
    : null;

  return (
    <Pressable style={styles.listingRow} onPress={onPress}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.listingImage} />
      ) : (
        <View style={[styles.listingImage, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>No photo</Text>
        </View>
      )}
      <View style={styles.listingBody}>
        <Text style={styles.listingTitle} numberOfLines={1}>
          {listing.title || "Untitled listing"}
        </Text>
        <Text style={styles.listingPrice}>{formatListingPrice(listing.price)}</Text>
        <Text style={styles.listingMeta} numberOfLines={1}>
          {listing.condition || "Condition not set"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function SellerProfileScreen({ navigation, route }) {
  const { currentUser } = useAuth();
  const { userId } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [error, setError] = useState("");
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const isOwnProfile = Boolean(currentUser?.uid && currentUser.uid === userId);
  const displayName = useMemo(() => getDisplayName(profile), [profile]);

  useEffect(() => {
    if (!userId) {
      setError("Seller profile is missing.");
      setLoadingProfile(false);
      return undefined;
    }

    return onSnapshot(
      doc(db, "users", userId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Seller profile not found.");
          setProfile(null);
        } else {
          setProfile({ id: snapshot.id, ...snapshot.data() });
          setError("");
        }
        setLoadingProfile(false);
      },
      (profileError) => {
        console.error("Error loading mobile seller profile:", profileError);
        setError("Unable to load this seller.");
        setLoadingProfile(false);
      }
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoadingListings(false);
      return undefined;
    }

    const listingsQuery = query(
      collection(db, "listings"),
      where("userId", "==", userId),
      where("status", "==", "active")
    );

    return onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .filter((listing) => listing.moderationStatus !== "hidden")
          .sort((a, b) => getDateTime(b.createdAt) - getDateTime(a.createdAt));
        setListings(nextListings);
        setLoadingListings(false);
      },
      (listingError) => {
        console.error("Error loading mobile seller listings:", listingError);
        setLoadingListings(false);
      }
    );
  }, [userId]);

  useEffect(() => {
    if (!currentUser?.uid || !userId || isOwnProfile) {
      setBlockedByMe(false);
      return undefined;
    }

    return subscribeToUserBlock(
      currentUser.uid,
      userId,
      setBlockedByMe,
      (blockError) => console.error("Error loading seller block status:", blockError)
    );
  }, [currentUser?.uid, isOwnProfile, userId]);

  function openReportModal() {
    if (!currentUser?.uid) {
      Alert.alert("Sign in required", "Sign in to report users.");
      return;
    }

    if (isOwnProfile) {
      Alert.alert("Your profile", "You cannot report your own profile.");
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

  async function submitUserReport() {
    if (!currentUser?.uid || !userId || !reportReason) return;

    setSubmittingReport(true);
    try {
      const now = new Date();
      const reporterName = `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
      await setDoc(doc(db, "userReports", `${currentUser.uid}_${userId}`), {
        reportedUserId: userId,
        reportedUserName: displayName,
        reporterId: currentUser.uid,
        reporterName,
        reason: reportReason,
        details: reportDetails.trim(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      closeReportModal();
      Alert.alert("Report submitted", "We will review this profile.");
    } catch (reportError) {
      console.error("Error submitting mobile user report:", reportError);
      Alert.alert("Unable to submit report", reportError.message || "Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleToggleBlock() {
    if (!currentUser?.uid) {
      Alert.alert("Sign in required", "Sign in to block users.");
      return;
    }

    if (isOwnProfile) return;

    const action = blockedByMe ? "unblock" : "block";
    const title = blockedByMe ? "Unblock user?" : "Block user?";
    const message = blockedByMe
      ? "You will be able to exchange messages with this user again."
      : "This will prevent this user from exchanging messages with you.";

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: blockedByMe ? "Unblock" : "Block",
        style: blockedByMe ? "default" : "destructive",
        onPress: async () => {
          setBlockLoading(true);
          try {
            if (action === "unblock") {
              await unblockUser(currentUser.uid, userId);
            } else {
              await blockUser(currentUser.uid, userId);
            }
          } catch (blockError) {
            console.error("Error updating mobile seller block:", blockError);
            Alert.alert("Unable to update block", blockError.message || "Please try again.");
          } finally {
            setBlockLoading(false);
          }
        },
      },
    ]);
  }

  if (loadingProfile) {
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
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.joined}>{getJoinedDate(profile)}</Text>
          </View>
        </View>

        {!isOwnProfile && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.secondaryButton, blockLoading && styles.disabledButton]}
              onPress={handleToggleBlock}
              disabled={blockLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {blockLoading ? "Updating..." : blockedByMe ? "Unblock user" : "Block user"}
              </Text>
            </Pressable>
            <Pressable style={styles.reportButton} onPress={openReportModal}>
              <Text style={styles.reportButtonText}>Report user</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active listings</Text>
          <Text style={styles.sectionCount}>{listings.length}</Text>
        </View>

        {loadingListings ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SellerListingRow
                listing={item}
                onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })}
              />
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>This seller has no active listings right now.</Text>
            }
          />
        )}
      </ScrollView>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={closeReportModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report user</Text>
            <Text style={styles.modalBody}>
              Reports help WeCube review unsafe, abusive, fake, or suspicious behavior.
            </Text>
            <Text style={styles.modalLabel}>Reason</Text>
            <View style={styles.reasonList}>
              {USER_REPORT_REASONS.map((reason) => (
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
                onPress={submitUserReport}
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
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "900",
  },
  headerText: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  joined: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  reportButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  reportButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionCount: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  listLoading: {
    padding: 24,
  },
  listingRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  listingImage: {
    backgroundColor: "#e2e8f0",
    height: 88,
    width: 88,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  listingBody: {
    flex: 1,
    justifyContent: "center",
    padding: 12,
  },
  listingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  listingPrice: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 5,
  },
  listingMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
    textTransform: "capitalize",
  },
  separator: {
    height: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 14,
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
