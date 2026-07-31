import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import {
  sendMessage,
  subscribeToConversationMessages,
} from "../utils/messaging";

function MessageBubble({ message, isMine }) {
  const isSystem = message.type === "system";

  return (
    <View
      style={[
        styles.bubble,
        isMine ? styles.myBubble : styles.theirBubble,
        isSystem && styles.systemBubble,
      ]}
    >
      <Text style={[styles.messageText, isMine && styles.myMessageText, isSystem && styles.systemText]}>
        {message.text}
      </Text>
    </View>
  );
}

export default function ConversationScreen({ route }) {
  const { currentUser } = useAuth();
  const { conversationId } = route.params || {};
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!conversationId) {
      setError("Conversation is missing.");
      setLoading(false);
      return undefined;
    }

    const unsubscribeConversation = onSnapshot(
      doc(db, "conversations", conversationId),
      (snapshot) => {
        if (snapshot.exists()) {
          setConversation({ id: snapshot.id, ...snapshot.data() });
        }
      },
      (snapshotError) => {
        console.error("Error loading mobile conversation:", snapshotError);
        setError("Unable to load this conversation.");
        setLoading(false);
      }
    );

    const unsubscribeMessages = subscribeToConversationMessages(
      conversationId,
      (nextMessages) => {
        setMessages(nextMessages);
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Error loading mobile messages:", snapshotError);
        setError("Unable to load messages.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeConversation();
      unsubscribeMessages();
    };
  }, [conversationId]);

  async function handleSend() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || !currentUser?.uid || sending) return;

    setSending(true);
    try {
      await sendMessage(conversationId, currentUser.uid, trimmedDraft);
      setDraft("");
    } catch (sendError) {
      console.error("Error sending mobile message:", sendError);
      setError(sendError.message || "Unable to send message.");
    } finally {
      setSending(false);
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

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
        style={styles.container}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {conversation?.closedReason === "listing_deleted" ? (
          <Text style={styles.closedNotice}>This listing was deleted, so the conversation is closed.</Text>
        ) : null}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMine={item.senderId === currentUser?.uid} />
          )}
          contentContainerStyle={styles.messageList}
        />
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message"
            style={styles.input}
            multiline
            editable={conversation?.closedReason !== "listing_deleted"}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!draft.trim() || sending || conversation?.closedReason === "listing_deleted") &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!draft.trim() || sending || conversation?.closedReason === "listing_deleted"}
          >
            <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  messageList: {
    gap: 8,
    padding: 16,
  },
  bubble: {
    borderRadius: 8,
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  myBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  theirBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  systemBubble: {
    alignSelf: "center",
    backgroundColor: colors.background,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  myMessageText: {
    color: "#fff",
  },
  systemText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: "#fff",
    fontWeight: "800",
  },
  closedNotice: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
    fontSize: 13,
    fontWeight: "700",
    padding: 10,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    padding: 10,
    textAlign: "center",
  },
});
