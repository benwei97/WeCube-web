import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import {
  blockUser,
  getListing,
  getUserProfile,
  sendMessage,
  subscribeToUserBlock,
  subscribeToConversationMessages,
  unblockUser,
} from "../utils/messaging";

const CONVERSATION_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abuse" },
  { value: "payment_or_shipping_issue", label: "Payment or shipping issue" },
  { value: "suspicious_messages", label: "Suspicious messages" },
  { value: "other", label: "Other" },
];

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
  const [otherUser, setOtherUser] = useState(null);
  const [listing, setListing] = useState(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

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

  useEffect(() => {
    if (!conversation || !currentUser?.uid) return undefined;

    const otherUserId =
      conversation.buyerId === currentUser.uid
        ? conversation.sellerId
        : conversation.buyerId;

    getUserProfile(otherUserId)
      .then(setOtherUser)
      .catch((profileError) => {
        console.error("Error loading mobile conversation user:", profileError);
      });
    getListing(conversation.listingId)
      .then(setListing)
      .catch((listingError) => {
        console.error("Error loading mobile conversation listing:", listingError);
      });

    const unsubscribeBlockedByMe = subscribeToUserBlock(
      currentUser.uid,
      otherUserId,
      setBlockedByMe,
      (blockError) => console.error("Error loading mobile user block:", blockError)
    );
    const unsubscribeBlockedMe = subscribeToUserBlock(
      otherUserId,
      currentUser.uid,
      setBlockedMe,
      (blockError) => console.error("Error loading mobile reverse user block:", blockError)
    );

    return () => {
      unsubscribeBlockedByMe();
      unsubscribeBlockedMe();
    };
  }, [conversation, currentUser?.uid]);

  const otherUserId =
    conversation && currentUser?.uid
      ? conversation.buyerId === currentUser.uid
        ? conversation.sellerId
        : conversation.buyerId
      : "";
  const otherUserName =
    `${otherUser?.firstName || ""} ${otherUser?.lastName || ""}`.trim() ||
    "this user";

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

  async function handleBlockToggle() {
    if (!currentUser?.uid || !otherUserId || blockLoading) return;

    setBlockLoading(true);
    try {
      if (blockedByMe) {
        await unblockUser(currentUser.uid, otherUserId);
      } else {
        await blockUser(currentUser.uid, otherUserId);
      }
    } catch (blockError) {
      console.error("Error updating mobile block:", blockError);
      setError(blockError.message || "Unable to update block status.");
    } finally {
      setBlockLoading(false);
    }
  }

  function openReportModal() {
    setReportReason("");
    setReportDetails("");
    setReportOpen(true);
  }

  function closeReportModal() {
    if (reportSubmitting) return;
    setReportOpen(false);
    setReportReason("");
    setReportDetails("");
  }

  async function submitReport() {
    if (!currentUser?.uid || !conversation?.id || !otherUserId || !reportReason) return;

    setReportSubmitting(true);
    try {
      const now = new Date();
      await setDoc(doc(db, "conversationReports", `${currentUser.uid}_${conversation.id}`), {
        conversationId: conversation.id,
        listingId: conversation.listingId,
        listingTitle: listing?.title || "",
        reportedUserId: otherUserId,
        reportedUserName: otherUserName,
        reporterId: currentUser.uid,
        reporterName: `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
        reason: reportReason,
        details: reportDetails.trim(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      closeReportModal();
      setError("");
    } catch (reportError) {
      console.error("Error submitting mobile conversation report:", reportError);
      setError(reportError.message || "Unable to submit report.");
    } finally {
      setReportSubmitting(false);
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
        {blockedByMe || blockedMe ? (
          <Text style={styles.closedNotice}>
            {blockedByMe ? "You blocked this user." : "Messaging is not available."}
          </Text>
        ) : null}
        <View style={styles.safetyActions}>
          <Pressable style={styles.safetyButton} onPress={openReportModal}>
            <Text style={styles.safetyText}>Report conversation</Text>
          </Pressable>
          {!blockedMe && (
            <Pressable style={styles.safetyButton} onPress={handleBlockToggle} disabled={blockLoading}>
              <Text style={[styles.safetyText, styles.blockText]}>
                {blockLoading ? "Updating..." : blockedByMe ? "Unblock user" : "Block user"}
              </Text>
            </Pressable>
          )}
        </View>
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
            editable={
              conversation?.closedReason !== "listing_deleted" &&
              !blockedByMe &&
              !blockedMe
            }
          />
          <Pressable
            style={[
              styles.sendButton,
              (!draft.trim() ||
                sending ||
                conversation?.closedReason === "listing_deleted" ||
                blockedByMe ||
                blockedMe) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={
              !draft.trim() ||
              sending ||
              conversation?.closedReason === "listing_deleted" ||
              blockedByMe ||
              blockedMe
            }
          >
            <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={closeReportModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report conversation</Text>
            <Text style={styles.modalBody}>
              Reports help WeCube review unsafe, suspicious, abusive, or problematic messages.
            </Text>
            <Text style={styles.modalLabel}>Reason</Text>
            <View style={styles.reasonList}>
              {CONVERSATION_REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.reasonOption,
                    reportReason === reason.value && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setReportReason(reason.value)}
                  disabled={reportSubmitting}
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
              editable={!reportSubmitting}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={closeReportModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  (!reportReason || reportSubmitting) && styles.modalSubmitButtonDisabled,
                ]}
                onPress={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                <Text style={styles.modalSubmitText}>
                  {reportSubmitting ? "Submitting..." : "Submit"}
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
  safetyActions: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 8,
  },
  safetyButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  safetyText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  blockText: {
    color: colors.danger,
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
    fontSize: 14,
    fontWeight: "700",
    padding: 10,
    textAlign: "center",
  },
});
