import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { getDateTime } from "../utils/listingUtils";

function ConversationRow({ conversation, onPress }) {
  const title =
    conversation.listingTitle ||
    (conversation.userRole === "seller" ? "Buyer conversation" : "Seller conversation");

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{title.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {conversation.lastMessage || "No messages yet"}
        </Text>
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

  useEffect(() => {
    if (!currentUser?.uid) return undefined;

    const buyerQuery = query(
      collection(db, "conversations"),
      where("buyerId", "==", currentUser.uid)
    );
    const sellerQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", currentUser.uid)
    );

    const handleError = (snapshotError) => {
      console.error("Error loading mobile conversations:", snapshotError);
      setError("Unable to load messages.");
      setLoading(false);
    };

    const unsubscribeBuyer = onSnapshot(
      buyerQuery,
      (snapshot) => {
        setBuyerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
            userRole: "buyer",
          }))
        );
        setLoading(false);
      },
      handleError
    );

    const unsubscribeSeller = onSnapshot(
      sellerQuery,
      (snapshot) => {
        setSellerConversations(
          snapshot.docs.map((conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
            userRole: "seller",
          }))
        );
        setLoading(false);
      },
      handleError
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
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate("Conversation", { conversationId: item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>Message a seller from a listing to start a conversation.</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 10,
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
  preview: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
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
