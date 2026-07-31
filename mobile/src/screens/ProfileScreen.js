import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { formatListingPrice, getDateTime } from "../utils/listingUtils";
import { closeListingConversationsForDeletedListing } from "../utils/messaging";
import { deleteMultipleImages, getS3PublicUrl } from "../utils/s3";

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

export default function ProfileScreen() {
  const { currentUser, logout } = useAuth();
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const displayName = `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim();

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase() || "W"}</Text>
          </View>
          <Text style={styles.name}>{displayName || "WeCube member"}</Text>
          {currentUser?.email ? <Text style={styles.email}>{currentUser.email}</Text> : null}
        </View>

        {loadingListings ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {renderListingSection("Active", groupedListings.active)}
            {renderListingSection("Pending", groupedListings.pending)}
            {renderListingSection("Sold", groupedListings.sold)}
          </>
        )}

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
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
});
