import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Screen from "../components/Screen";
import ScreenTitle from "../components/ScreenTitle";
import PageState from "../components/PageState";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { radii, typography } from "../theme/design";
import { getDateTime } from "../utils/listingUtils";
import { getS3PublicUrl } from "../utils/s3";
import {
  getListing,
  getUserProfile,
  isConversationUnread,
  markConversationAsRead,
} from "../utils/messaging";

function formatTime(timestamp) {
  const time = getDateTime(timestamp);
  if (!time) return "";

  const date = new Date(time);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getDisplayName(user) {
  return (
    user?.displayName ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "WeCube user"
  );
}

function getListingPhotoUrl(listing, conversation) {
  const s3Key =
    listing?.photos?.[0]?.s3Key ||
    conversation?.listingPhotoS3Key ||
    conversation?.listingPhotoKey ||
    "";

  return s3Key ? getS3PublicUrl(s3Key) : "";
}

function ConversationImage({
  listing,
  conversation,
  counterpart,
  counterpartName,
  onListingPress,
  onUserPress,
}) {
  const listingPhotoUrl = getListingPhotoUrl(listing, conversation);
  const avatarInitial = counterpartName.charAt(0).toUpperCase() || "W";

  return (
    <View style={styles.conversationImage}>
      <Pressable
        accessibilityLabel="Open listing"
        disabled={!conversation?.listingId}
        onPress={onListingPress}
        style={styles.listingImageButton}
      >
        {listingPhotoUrl ? (
          <Image source={{ uri: listingPhotoUrl }} style={styles.listingImage} />
        ) : (
          <View style={styles.listingImagePlaceholder}>
            <MaterialIcons name="inventory-2" size={22} color={colors.muted} />
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityLabel={`Open ${counterpartName}'s profile`}
        disabled={!onUserPress}
        hitSlop={8}
        onPress={onUserPress}
        style={styles.avatarOverlayButton}
      >
        {counterpart?.avatarUrl ? (
          <Image source={{ uri: counterpart.avatarUrl }} style={styles.avatarOverlayImage} />
        ) : (
          <View style={styles.avatarOverlay}>
            <Text style={styles.avatarOverlayText}>{avatarInitial}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ConversationRow({
  conversation,
  listing,
  counterpart,
  currentUserId,
  onListingPress,
  onPress,
  onUserPress,
}) {
  const unread = isConversationUnread(conversation, currentUserId);
  const counterpartName = getDisplayName(counterpart);
  const listingTitle = listing?.title || conversation.listingTitle || "Listing";
  const senderLabel =
    conversation.lastMessageSenderId === currentUserId
      ? "You"
      : counterpart?.firstName || counterpartName.split(" ")[0] || "User";
  const preview = conversation.lastMessageReviewPrompt
    ? "Rate your experience?"
    : conversation.lastMessage
      ? `${senderLabel}: ${conversation.lastMessage}`
      : "No messages yet";

  return (
    <Pressable style={[styles.row, unread && styles.rowUnread]} onPress={onPress}>
      <ConversationImage
        conversation={conversation}
        counterpart={counterpart}
        counterpartName={counterpartName}
        listing={listing}
        onListingPress={onListingPress}
        onUserPress={onUserPress}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.title, unread && styles.unreadText]} numberOfLines={1}>
          {counterpartName}
        </Text>
        <Text style={styles.listingTitle} numberOfLines={1}>
          {listingTitle}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        {unread ? <View style={styles.unreadDot} /> : null}
        <Text style={styles.timeText}>{formatTime(conversation.lastMessageAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen({ navigation }) {
  const { currentUser } = useAuth();
  const [buyerConversations, setBuyerConversations] = useState([]);
  const [sellerConversations, setSellerConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listingDetails, setListingDetails] = useState({});
  const [userDetails, setUserDetails] = useState({});

  useEffect(() => {
    if (!currentUser?.uid) return undefined;

    let buyerLoaded = false;
    let sellerLoaded = false;
    let buyerFailed = false;
    let sellerFailed = false;

    function finishLoadingIfReady() {
      if ((buyerLoaded || buyerFailed) && (sellerLoaded || sellerFailed)) {
        setLoading(false);
      }
    }

    function handleQueryError(role, snapshotError) {
      console.error(`Error loading mobile ${role} conversations:`, snapshotError);
      if (role === "buyer") {
        buyerFailed = true;
      } else {
        sellerFailed = true;
      }

      if (buyerFailed && sellerFailed) {
        setError("Unable to load messages.");
      }
      finishLoadingIfReady();
    }

    const buyerQuery = query(
      collection(db, "conversations"),
      where("buyerId", "==", currentUser.uid)
    );
    const sellerQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", currentUser.uid)
    );

    const unsubscribeBuyer = onSnapshot(
      buyerQuery,
      (snapshot) => {
        buyerLoaded = true;
        buyerFailed = false;
        setError("");
        setBuyerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
            userRole: "buyer",
          }))
        );
        finishLoadingIfReady();
      },
      (snapshotError) => handleQueryError("buyer", snapshotError)
    );

    const unsubscribeSeller = onSnapshot(
      sellerQuery,
      (snapshot) => {
        sellerLoaded = true;
        sellerFailed = false;
        setError("");
        setSellerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
            userRole: "seller",
          }))
        );
        finishLoadingIfReady();
      },
      (snapshotError) => handleQueryError("seller", snapshotError)
    );

    return () => {
      unsubscribeBuyer();
      unsubscribeSeller();
    };
  }, [currentUser?.uid]);

  const conversations = useMemo(
    () =>
      [...buyerConversations, ...sellerConversations]
        .filter((conversation) => conversation.status !== "rejected")
        .sort((a, b) => getDateTime(b.lastMessageAt) - getDateTime(a.lastMessageAt)),
    [buyerConversations, sellerConversations]
  );

  useEffect(() => {
    let active = true;

    async function loadDetails() {
      const nextListings = {};
      const nextUsers = {};

      await Promise.all(
        conversations.map(async (conversation) => {
          const otherUserId =
            conversation.userRole === "seller"
              ? conversation.buyerId
              : conversation.sellerId;

          try {
            if (conversation.listingId) {
              nextListings[conversation.listingId] = await getListing(conversation.listingId);
            }
          } catch (detailError) {
            console.error("Error loading mobile inbox listing:", detailError);
          }

          try {
            if (otherUserId) {
              nextUsers[otherUserId] = await getUserProfile(otherUserId);
            }
          } catch (detailError) {
            console.error("Error loading mobile inbox user:", detailError);
          }
        })
      );

      if (active) {
        setListingDetails(nextListings);
        setUserDetails(nextUsers);
      }
    }

    if (conversations.length > 0) {
      loadDetails();
    } else {
      setListingDetails({});
      setUserDetails({});
    }

    return () => {
      active = false;
    };
  }, [conversations]);

  async function openConversation(conversation) {
    if (currentUser?.uid && isConversationUnread(conversation, currentUser.uid)) {
      markConversationAsRead(conversation.id, currentUser.uid).catch((readError) =>
        console.error("Error marking mobile conversation read:", readError)
      );
    }
    navigation.navigate("Conversation", { conversationId: conversation.id });
  }

  function openListing(conversation) {
    if (!conversation?.listingId) return;
    navigation.navigate("ListingDetail", { listingId: conversation.listingId });
  }

  function openUserProfile(userId) {
    if (!userId) return;
    navigation.navigate("SellerProfile", { userId });
  }

  function renderConversation({ item }) {
    const counterpartId = item.userRole === "seller" ? item.buyerId : item.sellerId;

    return (
      <ConversationRow
        conversation={item}
        currentUserId={currentUser?.uid}
        listing={listingDetails[item.listingId]}
        counterpart={userDetails[counterpartId]}
        onListingPress={() => openListing(item)}
        onPress={() => openConversation(item)}
        onUserPress={counterpartId ? () => openUserProfile(counterpartId) : null}
      />
    );
  }

  if (loading) {
    return (
      <Screen>
        <PageState
          variant="loading"
          title="Loading messages"
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <PageState title="Unable to load messages" message={error} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ScreenTitle>Messages</ScreenTitle>}
        renderItem={renderConversation}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <PageState
            title="No messages yet"
            message="Message a seller from a listing to start a conversation."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: 10,
    padding: 16,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  rowUnread: {
    borderColor: colors.primary,
    backgroundColor: "#f8faff",
  },
  conversationImage: {
    height: 56,
    position: "relative",
    width: 56,
  },
  listingImage: {
    backgroundColor: "#e2e8f0",
    borderRadius: radii.card,
    height: 52,
    width: 52,
  },
  listingImageButton: {
    height: 52,
    width: 52,
  },
  listingImagePlaceholder: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  avatarOverlay: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 13,
    borderWidth: 2,
    bottom: 0,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    width: 26,
  },
  avatarOverlayButton: {
    bottom: 0,
    height: 26,
    position: "absolute",
    right: 0,
    width: 26,
  },
  avatarOverlayImage: {
    backgroundColor: "#e2e8f0",
    borderColor: colors.surface,
    borderRadius: 13,
    borderWidth: 2,
    bottom: 0,
    height: 26,
    position: "absolute",
    right: 0,
    width: 26,
  },
  avatarOverlayText: {
    fontFamily: typography.caption.fontFamily,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  rowBody: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  unreadText: {
    color: colors.primary,
  },
  listingTitle: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  preview: {
    ...typography.body,
    color: colors.muted,
    marginTop: 4,
  },
  rowMeta: {
    alignItems: "flex-end",
    gap: 8,
    marginLeft: 8,
  },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  timeText: {
    ...typography.caption,
    color: colors.muted,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
