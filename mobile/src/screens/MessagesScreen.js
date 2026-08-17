import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Screen from "../components/Screen";
import ScreenTitle from "../components/ScreenTitle";
import PageState from "../components/PageState";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { getDateTime } from "../utils/listingUtils";
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
    user?.email ||
    "WeCube user"
  );
}

function ConversationRow({ conversation, listing, counterpart, currentUserId, onPress }) {
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
      {counterpart?.avatarUrl ? (
        <Image source={{ uri: counterpart.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{counterpartName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
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
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            currentUserId={currentUser?.uid}
            listing={listingDetails[item.listingId]}
            counterpart={
              userDetails[item.userRole === "seller" ? item.buyerId : item.sellerId]
            }
            onPress={() => openConversation(item)}
          />
        )}
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
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  rowUnread: {
    borderColor: colors.primary,
    backgroundColor: "#f8faff",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarImage: {
    backgroundColor: "#e2e8f0",
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: "800",
  },
  rowBody: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  unreadText: {
    color: colors.primary,
  },
  listingTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  preview: {
    color: colors.muted,
    fontSize: 14,
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
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
