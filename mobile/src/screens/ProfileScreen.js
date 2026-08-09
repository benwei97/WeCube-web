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
import * as ImagePicker from "expo-image-picker";
import { deleteUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  documentId,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import Screen from "../components/Screen";
import MobileListingCard from "../components/MobileListingCard";
import { useAuth } from "../contexts/useAuth";
import { auth, db } from "../lib/firebase";
import { colors } from "../theme/colors";
import {
  formatListingPrice,
  getDateTime,
  shouldShowListingInMarketplace,
  sortListingsByAvailabilityAndDate,
} from "../utils/listingUtils";
import {
  cancelListingReviewPrompts,
  closeListingConversationsForDeletedListing,
} from "../utils/messaging";
import {
  deleteMultipleImages,
  getS3PublicUrl,
  uploadAvatarAssetToS3,
} from "../utils/s3";

const ACCOUNT_DELETE_CONFIRMATION = "DELETE";
const ACCOUNT_DELETE_RECENT_LOGIN_WINDOW_MS = 5 * 60 * 1000;

function statusLabel(status) {
  if (status === "archived") return "Pending";
  if (status === "sold") return "Sold";
  return "Active";
}

function ListingRow({ listing, onStatusChange, onDelete, loading }) {
  const thumbnailUrl = listing.photos?.[0]?.s3Key
    ? getS3PublicUrl(listing.photos[0].s3Key)
    : null;
  const isPending = listing.status === "archived";
  const canToggleAvailability = listing.status !== "sold";

  return (
    <View style={styles.listingRow}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <Text style={styles.thumbnailPlaceholderText}>No photo</Text>
        </View>
      )}
      <View style={styles.listingBody}>
        <Text style={styles.listingTitle} numberOfLines={1}>
          {listing.title || "Untitled listing"}
        </Text>
        <Text style={styles.listingMeta}>
          {formatListingPrice(listing.price)} · {statusLabel(listing.status)}
        </Text>
        <View style={styles.actionRow}>
          {canToggleAvailability && (
            <Pressable
              style={styles.actionButton}
              onPress={() => onStatusChange(listing, isPending ? "active" : "archived")}
              disabled={loading}
            >
              <Text style={styles.actionText}>
                {isPending ? "Mark available" : "Mark pending"}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => onDelete(listing)}
            disabled={loading}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { currentUser, logout } = useAuth();
  const [listings, setListings] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingSavedListings, setLoadingSavedListings] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountText, setDeleteAccountText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState("");
  const [lastNameDraft, setLastNameDraft] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const displayName = `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim();
  const avatarUrl = currentUser?.avatarUrl || "";

  useEffect(() => {
    if (!currentUser?.uid) {
      setListings([]);
      setLoadingListings(false);
      return undefined;
    }

    const listingsQuery = query(
      collection(db, "listings"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .sort((a, b) => getDateTime(b.createdAt) - getDateTime(a.createdAt));
        setListings(nextListings);
        setLoadingListings(false);
      },
      (error) => {
        console.error("Error loading mobile profile listings:", error);
        setLoadingListings(false);
      }
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  useEffect(() => {
    const savedListingIds = Array.isArray(currentUser?.savedListings)
      ? currentUser.savedListings.filter(Boolean)
      : [];

    if (!currentUser?.uid || savedListingIds.length === 0) {
      setSavedListings([]);
      setLoadingSavedListings(false);
      return;
    }

    let active = true;
    setLoadingSavedListings(true);

    async function loadSavedListings() {
      try {
        const chunks = [];
        for (let index = 0; index < savedListingIds.length; index += 10) {
          chunks.push(savedListingIds.slice(index, index + 10));
        }

        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(query(collection(db, "listings"), where(documentId(), "in", chunk)))
          )
        );

        const nextListings = snapshots
          .flatMap((snapshot) =>
            snapshot.docs.map((listingDoc) => ({
              id: listingDoc.id,
              ...listingDoc.data(),
            }))
          )
          .filter(shouldShowListingInMarketplace);

        if (active) {
          setSavedListings(sortListingsByAvailabilityAndDate(nextListings));
        }
      } catch (error) {
        console.error("Error loading mobile saved listings:", error);
        if (active) setSavedListings([]);
      } finally {
        if (active) setLoadingSavedListings(false);
      }
    }

    loadSavedListings();

    return () => {
      active = false;
    };
  }, [currentUser?.savedListings, currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setPurchases([]);
      setLoadingPurchases(false);
      return undefined;
    }

    const purchasesQuery = query(
      collection(db, "listings"),
      where("buyerId", "==", currentUser.uid)
    );

    return onSnapshot(
      purchasesQuery,
      (snapshot) => {
        const nextPurchases = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .filter((listing) => listing.status === "sold")
          .sort(
            (a, b) =>
              getDateTime(b.soldAt || b.updatedAt) -
              getDateTime(a.soldAt || a.updatedAt)
          );
        setPurchases(nextPurchases);
        setLoadingPurchases(false);
      },
      (error) => {
        console.error("Error loading mobile purchases:", error);
        setLoadingPurchases(false);
      }
    );
  }, [currentUser?.uid]);

  const groupedListings = useMemo(
    () => ({
      active: listings.filter((listing) => listing.status === "active"),
      pending: listings.filter((listing) => listing.status === "archived"),
      sold: listings.filter((listing) => listing.status === "sold"),
    }),
    [listings]
  );

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      Alert.alert("Unable to sign out", error.message || "Please try again.");
    }
  }

  function openEditProfileModal() {
    setFirstNameDraft(currentUser?.firstName || "");
    setLastNameDraft(currentUser?.lastName || "");
    setEditProfileOpen(true);
  }

  function closeEditProfileModal() {
    if (savingProfile || avatarUploading) return;
    setEditProfileOpen(false);
    setFirstNameDraft("");
    setLastNameDraft("");
  }

  async function saveProfileName() {
    const firstName = firstNameDraft.trim();
    const lastName = lastNameDraft.trim();

    if (!firstName || !lastName || !currentUser?.uid) {
      Alert.alert("Check name", "Enter a first and last name.");
      return;
    }

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        firstName,
        lastName,
      });
      setEditProfileOpen(false);
    } catch (error) {
      console.error("Error updating mobile profile name:", error);
      Alert.alert("Unable to save profile", error.message || "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function pickAvatar() {
    if (!currentUser?.uid) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to update your profile photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.85,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setAvatarUploading(true);
    try {
      const uploadedAvatar = await uploadAvatarAssetToS3(result.assets[0], currentUser.uid);
      await updateDoc(doc(db, "users", currentUser.uid), {
        avatarUrl: uploadedAvatar.url,
        avatarS3Key: uploadedAvatar.s3Key,
      });

      if (currentUser.avatarS3Key) {
        try {
          await deleteMultipleImages([currentUser.avatarS3Key]);
        } catch (cleanupError) {
          console.error("Error deleting previous mobile avatar:", cleanupError);
        }
      }
    } catch (error) {
      console.error("Error uploading mobile avatar:", error);
      Alert.alert("Unable to update avatar", error.message || "Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    if (!currentUser?.uid || !currentUser.avatarS3Key) return;

    setAvatarUploading(true);
    try {
      const previousAvatarKey = currentUser.avatarS3Key;
      await updateDoc(doc(db, "users", currentUser.uid), {
        avatarUrl: "",
        avatarS3Key: "",
      });
      await deleteMultipleImages([previousAvatarKey]);
    } catch (error) {
      console.error("Error removing mobile avatar:", error);
      Alert.alert("Unable to remove avatar", error.message || "Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function updateListingStatus(listing, nextStatus) {
    setActionLoadingId(listing.id);
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
          currentUser?.firstName || displayName.trim().split(/\s+/)[0] || "Seller",
          listing.title || "this listing"
        );
      }
    } catch (error) {
      console.error("Error updating mobile listing status:", error);
      Alert.alert("Unable to update listing", error.message || "Please try again.");
    } finally {
      setActionLoadingId("");
    }
  }

  function confirmDeleteListing(listing) {
    Alert.alert(
      "Delete listing?",
      `Permanently delete "${listing.title || "this listing"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteListing(listing),
        },
      ]
    );
  }

  async function deleteListing(listing) {
    setActionLoadingId(listing.id);
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
    } catch (error) {
      console.error("Error deleting mobile listing:", error);
      Alert.alert("Unable to delete listing", error.message || "Please try again.");
    } finally {
      setActionLoadingId("");
    }
  }

  function closeDeleteAccountModal() {
    if (deletingAccount) return;
    setDeleteAccountOpen(false);
    setDeleteAccountText("");
  }

  async function deleteAccount() {
    if (deleteAccountText !== ACCOUNT_DELETE_CONFIRMATION || !currentUser?.uid) return;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.uid !== currentUser.uid) {
      Alert.alert("Sign in again", "Unable to confirm your signed-in session. Please sign in again.");
      return;
    }

    const lastSignInAt = Date.parse(firebaseUser.metadata?.lastSignInTime || "");
    const hasRecentLogin =
      Number.isFinite(lastSignInAt) &&
      Date.now() - lastSignInAt <= ACCOUNT_DELETE_RECENT_LOGIN_WINDOW_MS;

    if (!hasRecentLogin) {
      Alert.alert(
        "Sign in again",
        "For security, sign out and sign back in, then try deleting your account again."
      );
      return;
    }

    setDeletingAccount(true);
    try {
      const listingsSnapshot = await getDocs(
        query(collection(db, "listings"), where("userId", "==", currentUser.uid))
      );

      for (const listingDoc of listingsSnapshot.docs) {
        const listing = { id: listingDoc.id, ...listingDoc.data() };
        const s3Keys = (listing.photos || []).map((photo) => photo.s3Key).filter(Boolean);
        if (s3Keys.length) {
          try {
            await deleteMultipleImages(s3Keys);
          } catch (cleanupError) {
            console.error("Error deleting listing images during mobile account deletion:", cleanupError);
          }
        }

        try {
          await closeListingConversationsForDeletedListing(
            listing.id,
            listing.userId,
            listing.title || "this listing"
          );
        } catch (conversationError) {
          console.error("Error closing conversations during mobile account deletion:", conversationError);
        }

        await deleteDoc(doc(db, "listings", listing.id));
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        email: "",
        firstName: "Deleted",
        lastName: "User",
        avatarUrl: "",
        avatarS3Key: "",
        attendingCompetitions: [],
        savedListings: [],
        deletedAt: new Date(),
        deletedByUser: true,
      });

      await deleteUser(firebaseUser);
      setDeleteAccountText("");
      setDeleteAccountOpen(false);
    } catch (error) {
      console.error("Error deleting mobile account:", error);
      if (error.code === "auth/requires-recent-login") {
        Alert.alert(
          "Sign in again",
          "For security, sign out and sign back in, then try deleting your account again."
        );
      } else {
        Alert.alert("Unable to delete account", error.message || "Please try again.");
      }
    } finally {
      setDeletingAccount(false);
    }
  }

  function renderListingSection(title, data) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {data.length ? (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListingRow
                listing={item}
                onStatusChange={updateListingStatus}
                onDelete={confirmDeleteListing}
                loading={actionLoadingId === item.id}
              />
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <Text style={styles.emptyText}>No {title.toLowerCase()} listings.</Text>
        )}
      </View>
    );
  }

  function renderSavedListingsSection() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Listings</Text>
        {loadingSavedListings ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : savedListings.length === 0 ? (
          <Text style={styles.emptyText}>No saved listings yet.</Text>
        ) : (
          <FlatList
            data={savedListings}
            numColumns={2}
            columnWrapperStyle={styles.savedListingRow}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.savedListingSlot}>
                <MobileListingCard
                  listing={item}
                  style={styles.savedListingCard}
                  onPress={() =>
                    navigation.navigate("ListingDetail", { listingId: item.id })
                  }
                />
              </View>
            )}
            scrollEnabled={false}
          />
        )}
      </View>
    );
  }

  function renderPurchasesSection() {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Purchases</Text>
        {loadingPurchases ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : purchases.length === 0 ? (
          <Text style={styles.emptyText}>No purchases yet.</Text>
        ) : (
          <FlatList
            data={purchases}
            numColumns={2}
            columnWrapperStyle={styles.savedListingRow}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.savedListingSlot}>
                <MobileListingCard
                  listing={item}
                  style={styles.savedListingCard}
                  onPress={() =>
                    navigation.navigate("ListingDetail", { listingId: item.id })
                  }
                />
              </View>
            )}
            scrollEnabled={false}
          />
        )}
      </View>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.profileHeader}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase() || "W"}</Text>
            </View>
          )}
          <Text style={styles.name}>{displayName || "WeCube member"}</Text>
          {currentUser?.email ? <Text style={styles.email}>{currentUser.email}</Text> : null}
          <Pressable style={styles.editProfileButton} onPress={openEditProfileModal}>
            <Text style={styles.editProfileText}>Edit profile</Text>
          </Pressable>
        </View>

        {loadingListings ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {renderSavedListingsSection()}
            {renderListingSection("Active", groupedListings.active)}
            {renderListingSection("Pending", groupedListings.pending)}
            {renderListingSection("Sold", groupedListings.sold)}
            {renderPurchasesSection()}
          </>
        )}

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>

        <Pressable style={styles.infoButton} onPress={() => navigation.navigate("Info")}>
          <Text style={styles.infoText}>About & policies</Text>
        </Pressable>

        <Pressable style={styles.deleteAccountButton} onPress={() => setDeleteAccountOpen(true)}>
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </Pressable>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={deleteAccountOpen}
        onRequestClose={closeDeleteAccountModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account</Text>
            <Text style={styles.modalBody}>
              This permanently deletes your sign-in and removes your listings. Your public profile
              will be shown as Deleted User, and messages, reviews, and reports may be retained for
              safety and service integrity.
            </Text>
            <TextInput
              value={deleteAccountText}
              onChangeText={setDeleteAccountText}
              style={styles.input}
              placeholder="Type DELETE to confirm"
              autoCapitalize="characters"
              editable={!deletingAccount}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeDeleteAccountModal}
                disabled={deletingAccount}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalDeleteButton,
                  (deleteAccountText !== ACCOUNT_DELETE_CONFIRMATION || deletingAccount) &&
                    styles.modalDeleteButtonDisabled,
                ]}
                onPress={deleteAccount}
                disabled={deleteAccountText !== ACCOUNT_DELETE_CONFIRMATION || deletingAccount}
              >
                <Text style={styles.modalDeleteText}>
                  {deletingAccount ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={editProfileOpen}
        onRequestClose={closeEditProfileModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit profile</Text>
            <View style={styles.avatarEditor}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} />
              ) : (
                <View style={styles.avatarPreviewPlaceholder}>
                  <Text style={styles.avatarPreviewText}>
                    {displayName.charAt(0).toUpperCase() || "W"}
                  </Text>
                </View>
              )}
              <View style={styles.avatarActions}>
                <Pressable
                  style={[styles.smallActionButton, avatarUploading && styles.disabledButton]}
                  onPress={pickAvatar}
                  disabled={avatarUploading}
                >
                  <Text style={styles.smallActionText}>
                    {avatarUploading ? "Uploading..." : "Change photo"}
                  </Text>
                </Pressable>
                {currentUser?.avatarS3Key ? (
                  <Pressable
                    style={styles.removeAvatarButton}
                    onPress={removeAvatar}
                    disabled={avatarUploading}
                  >
                    <Text style={styles.removeAvatarText}>Remove photo</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.modalLabel}>First name</Text>
            <TextInput
              value={firstNameDraft}
              onChangeText={setFirstNameDraft}
              style={styles.input}
              maxLength={50}
              editable={!savingProfile}
            />
            <Text style={styles.modalLabel}>Last name</Text>
            <TextInput
              value={lastNameDraft}
              onChangeText={setLastNameDraft}
              style={styles.input}
              maxLength={50}
              editable={!savingProfile}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeEditProfileModal}
                disabled={savingProfile || avatarUploading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSaveButton,
                  (savingProfile || avatarUploading) && styles.modalSaveButtonDisabled,
                ]}
                onPress={saveProfileName}
                disabled={savingProfile || avatarUploading}
              >
                <Text style={styles.modalSaveText}>
                  {savingProfile ? "Saving..." : "Save"}
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
  container: {
    padding: 16,
    paddingBottom: 36,
  },
  profileHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  avatarImage: {
    backgroundColor: "#e2e8f0",
    borderRadius: 36,
    height: 72,
    width: 72,
  },
  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 14,
  },
  email: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  editProfileButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editProfileText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  loadingBlock: {
    padding: 24,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  listingRow: {
    flexDirection: "row",
  },
  thumbnail: {
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
    height: 76,
    width: 76,
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailPlaceholderText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  listingBody: {
    flex: 1,
    marginLeft: 12,
  },
  savedListingRow: {
    alignItems: "stretch",
  },
  savedListingSlot: {
    marginBottom: 8,
    paddingHorizontal: 4,
    width: "50%",
  },
  savedListingCard: {
    flex: 1,
  },
  listingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  listingMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  deleteButton: {
    borderColor: "#fecaca",
  },
  deleteText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  separator: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 12,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
  logoutButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 18,
    paddingVertical: 12,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "800",
  },
  infoButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  infoText: {
    color: colors.text,
    fontWeight: "800",
  },
  deleteAccountButton: {
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 10,
  },
  deleteAccountText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
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
  avatarEditor: {
    alignItems: "center",
    marginTop: 16,
  },
  avatarPreview: {
    backgroundColor: "#e2e8f0",
    borderRadius: 44,
    height: 88,
    width: 88,
  },
  avatarPreviewPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 44,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  avatarPreviewText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
  },
  avatarActions: {
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  smallActionButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  removeAvatarButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeAvatarText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  modalLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  modalDeleteButton: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalDeleteButtonDisabled: {
    opacity: 0.45,
  },
  modalDeleteText: {
    color: "#fff",
    fontWeight: "800",
  },
  modalSaveButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSaveButtonDisabled: {
    opacity: 0.45,
  },
  modalSaveText: {
    color: "#fff",
    fontWeight: "800",
  },
});
