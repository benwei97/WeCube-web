import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import Screen from "../components/Screen";
import ActionSheet from "../components/ActionSheet";
import BackButton from "../components/BackButton";
import PageState from "../components/PageState";
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
  updateReviewPromptResponse,
} from "../utils/messaging";
import { submitTransactionReview } from "../utils/reviews";
import { getS3PublicUrl } from "../utils/s3";

const CONVERSATION_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abuse" },
  { value: "payment_or_shipping_issue", label: "Payment or shipping issue" },
  { value: "suspicious_messages", label: "Suspicious messages" },
  { value: "other", label: "Other" },
];

function getListingPhotoUrl(listing, conversation) {
  const s3Key =
    listing?.photos?.[0]?.s3Key ||
    conversation?.listingPhotoS3Key ||
    conversation?.listingPhotoKey ||
    "";

  return s3Key ? getS3PublicUrl(s3Key) : "";
}

function HeaderConversationImage({
  listing,
  conversation,
  userAvatarUrl,
  userName,
  onListingPress,
  onUserPress,
}) {
  const listingPhotoUrl = getListingPhotoUrl(listing, conversation);
  const avatarInitial = userName.charAt(0).toUpperCase() || "W";

  return (
    <View style={styles.headerPreview}>
      <Pressable
        accessibilityLabel="Open listing"
        disabled={!conversation?.listingId}
        onPress={onListingPress}
        style={styles.headerListingButton}
      >
        {listingPhotoUrl ? (
          <Image source={{ uri: listingPhotoUrl }} style={styles.headerListingImage} />
        ) : (
          <View style={styles.headerListingPlaceholder}>
            <MaterialIcons name="inventory-2" size={22} color={colors.muted} />
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityLabel={`Open ${userName}'s profile`}
        disabled={!onUserPress}
        hitSlop={8}
        onPress={onUserPress}
        style={styles.headerAvatarOverlayButton}
      >
        {userAvatarUrl ? (
          <Image source={{ uri: userAvatarUrl }} style={styles.headerAvatarOverlayImage} />
        ) : (
          <View style={styles.headerAvatarOverlay}>
            <Text style={styles.headerAvatarOverlayText}>{avatarInitial}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function MessageBubble({ message, isMine, reviewPromptState, onReviewPress }) {
  if (reviewPromptState?.hidden) return null;

  if (reviewPromptState) {
    return (
      <View style={styles.reviewPromptCard}>
        <Text style={styles.reviewPromptText}>{message.text}</Text>
        {reviewPromptState.response ? (
          <Text style={styles.reviewPromptDone}>You already reviewed this user.</Text>
        ) : reviewPromptState.closed ? (
          <Text style={styles.reviewPromptClosed}>Review request closed.</Text>
        ) : (
          <Pressable style={styles.reviewPromptButton} onPress={() => onReviewPress(message)}>
            <Text style={styles.reviewPromptButtonText}>Write review</Text>
          </Pressable>
        )}
      </View>
    );
  }

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

export default function ConversationScreen({ navigation, route }) {
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
  const [conversationActionsOpen, setConversationActionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

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
  const headerUserName = otherUserName === "this user" ? "WeCube user" : otherUserName;
  const otherUserAvatarUrl = otherUser?.avatarUrl || "";
  const listingTitle = listing?.title || conversation?.listingTitle || "Listing";

  function openConversationListing() {
    if (!conversation?.listingId) return;
    navigation.navigate("ListingDetail", { listingId: conversation.listingId });
  }

  function openOtherUserProfile() {
    if (!otherUserId) return;
    navigation.navigate("SellerProfile", { userId: otherUserId });
  }

  function getReviewPromptState(message) {
    const isReviewPrompt = message.type === "review_prompt" || message.reviewPrompt;
    if (!isReviewPrompt || !currentUser?.uid) return null;

    const response = message.reviewResponses?.[currentUser.uid] || null;
    const closed = conversation?.activeSaleEventId !== message.saleEventId;

    return {
      response,
      closed,
      hidden: !response && closed,
    };
  }

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

    const action = blockedByMe ? "unblock" : "block";
    const title = blockedByMe ? "Unblock user?" : "Block user?";
    const message = blockedByMe
      ? `You will be able to exchange messages with ${headerUserName} again.`
      : `This will prevent ${headerUserName} from exchanging messages with you.`;

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: blockedByMe ? "Unblock" : "Block",
        style: blockedByMe ? "default" : "destructive",
        onPress: async () => {
          setBlockLoading(true);
          try {
            if (action === "unblock") {
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
        },
      },
    ]);
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

      setReportOpen(false);
      setReportReason("");
      setReportDetails("");
      setError("");
    } catch (reportError) {
      console.error("Error submitting mobile conversation report:", reportError);
      setError(reportError.message || "Unable to submit report.");
    } finally {
      setReportSubmitting(false);
    }
  }

  function openReviewModal(message) {
    setReviewMessage(message);
    setReviewRating(5);
    setReviewComment("");
    setReviewOpen(true);
  }

  function closeReviewModal() {
    if (reviewSubmitting) return;
    setReviewOpen(false);
    setReviewMessage(null);
    setReviewRating(5);
    setReviewComment("");
  }

  async function submitReview() {
    if (!currentUser?.uid || !conversation?.id || !listing?.id || !reviewMessage || !otherUserId) {
      return;
    }

    const recipientRole = currentUser.uid === conversation.sellerId ? "buyer" : "seller";
    const reviewListing = {
      id: conversation.listingId,
      ...listing,
      title: listing.title || "Listing",
      userId: conversation.sellerId,
      buyerId: conversation.buyerId,
      saleEventId:
        reviewMessage.saleEventId ||
        conversation.activeSaleEventId ||
        listing.saleEventId ||
        null,
    };

    setReviewSubmitting(true);
    try {
      let alreadyReviewed = false;
      try {
        await submitTransactionReview({
          listing: reviewListing,
          reviewer: currentUser,
          rating: reviewRating,
          comment: reviewComment,
          recipientId: otherUserId,
          recipientName: otherUserName,
          recipientRole,
          saleEventId: reviewMessage.saleEventId || conversation.activeSaleEventId || null,
        });
      } catch (submitError) {
        if (submitError.message === "You have already reviewed this user") {
          alreadyReviewed = true;
        } else {
          throw submitError;
        }
      }
      await updateReviewPromptResponse(reviewMessage.id, currentUser.uid, "reviewed");
      closeReviewModal();
      Alert.alert(
        alreadyReviewed ? "Review already submitted" : "Review submitted",
        alreadyReviewed ? "Your previous review is already on this profile." : "Your review has been added."
      );
    } catch (reviewError) {
      console.error("Error submitting mobile review:", reviewError);
      Alert.alert("Unable to submit review", reviewError.message || "Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <PageState
          variant="loading"
          title="Loading conversation"
        />
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
        <View style={styles.topBar}>
          <BackButton navigation={navigation} style={styles.backButton} />
          <View style={styles.headerUser}>
            <HeaderConversationImage
              conversation={conversation}
              listing={listing}
              onListingPress={openConversationListing}
              onUserPress={otherUserId ? openOtherUserProfile : null}
              userAvatarUrl={otherUserAvatarUrl}
              userName={headerUserName}
            />
            <View style={styles.headerCopy}>
              <Text style={styles.headerName} numberOfLines={1}>
                {headerUserName}
              </Text>
              <Text style={styles.headerListingTitle} numberOfLines={1}>
                {listingTitle}
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.moreButton}
            onPress={() => setConversationActionsOpen(true)}
            accessibilityLabel="Conversation options"
          >
            <MaterialIcons name="more-horiz" size={24} color={colors.text} />
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {conversation?.closedReason === "listing_deleted" ? (
          <Text style={styles.closedNotice}>This listing was deleted, so the conversation is closed.</Text>
        ) : null}
        {blockedByMe || blockedMe ? (
          <Text style={styles.closedNotice}>
            {blockedByMe ? "You blocked this user." : "Messaging is not available."}
          </Text>
        ) : null}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.senderId === currentUser?.uid}
              reviewPromptState={getReviewPromptState(item)}
              onReviewPress={openReviewModal}
            />
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

      <ActionSheet
        visible={conversationActionsOpen}
        onClose={() => setConversationActionsOpen(false)}
        showCancel={false}
        showCloseButton
        actions={[
          {
            label: "Report conversation",
            onPress: openReportModal,
          },
          ...(!blockedMe
            ? [
                {
                  label: blockLoading
                    ? "Updating..."
                    : blockedByMe
                      ? "Unblock user"
                      : "Block user",
                  destructive: !blockedByMe,
                  disabled: blockLoading,
                  onPress: handleBlockToggle,
                },
              ]
            : []),
        ]}
      />

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

      <Modal visible={reviewOpen} transparent animationType="fade" onRequestClose={closeReviewModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rate your experience</Text>
            <Text style={styles.modalBody}>Share how it went with {otherUserName}.</Text>
            <Text style={styles.modalLabel}>Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable
                  key={value}
                  style={styles.ratingButton}
                  onPress={() => setReviewRating(value)}
                  disabled={reviewSubmitting}
                  accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
                >
                  <MaterialIcons
                    name={value <= reviewRating ? "star" : "star-border"}
                    size={34}
                    color={value <= reviewRating ? colors.text : colors.muted}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalLabel}>Review</Text>
            <TextInput
              value={reviewComment}
              onChangeText={(value) => setReviewComment(value.slice(0, 1000))}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Share how the experience went."
              maxLength={1000}
              multiline
              editable={!reviewSubmitting}
            />
            <Text style={styles.characterCount}>{reviewComment.length}/1000</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={closeReviewModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmitButton, reviewSubmitting && styles.modalSubmitButtonDisabled]}
                onPress={submitReview}
                disabled={reviewSubmitting}
              >
                <Text style={styles.modalSubmitText}>
                  {reviewSubmitting ? "Submitting..." : "Submit"}
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
  topBar: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    marginBottom: 0,
  },
  headerUser: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  headerPreview: {
    height: 54,
    position: "relative",
    width: 54,
  },
  headerListingImage: {
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    height: 50,
    width: 50,
  },
  headerListingButton: {
    height: 50,
    width: 50,
  },
  headerListingPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  headerAvatarOverlay: {
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
  headerAvatarOverlayButton: {
    bottom: 0,
    height: 26,
    position: "absolute",
    right: 0,
    width: 26,
  },
  headerAvatarOverlayImage: {
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
  headerAvatarOverlayText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  headerListingTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  moreButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
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
  reviewPromptCard: {
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: "88%",
    padding: 12,
  },
  reviewPromptText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  reviewPromptButton: {
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reviewPromptButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  reviewPromptDone: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  reviewPromptClosed: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
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
  ratingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
  },
  ratingButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  characterCount: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    textAlign: "right",
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
