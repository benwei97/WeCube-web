import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  InputAccessoryView,
  Keyboard,
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
import { radii, typography } from "../theme/design";
import {
  blockUser,
  getListing,
  getUserProfile,
  isConversationUnread,
  markConversationAsRead,
  sendMessage,
  subscribeToUserBlock,
  subscribeToConversationMessages,
  unblockUser,
  updateReviewPromptResponse,
} from "../utils/messaging";
import { getExistingReview, submitTransactionReview } from "../utils/reviews";
import { getS3PublicUrl } from "../utils/s3";

const CONVERSATION_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abuse" },
  { value: "payment_or_shipping_issue", label: "Payment or shipping issue" },
  { value: "suspicious_messages", label: "Suspicious messages" },
  { value: "other", label: "Other" },
];
const MESSAGE_TIME_DIVIDER_GAP_MINUTES = 30;
const IOS_KEYBOARD_LAYOUT_DURATION_MS = 10;
const IOS_KEYBOARD_TRANSITION_BUFFER_MS = 20;

function getTimestampDate(timestamp) {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameCalendarDay(firstDate, secondDate) {
  return (
    firstDate?.getFullYear() === secondDate?.getFullYear() &&
    firstDate?.getMonth() === secondDate?.getMonth() &&
    firstDate?.getDate() === secondDate?.getDate()
  );
}

function formatTranscriptTimeDivider(timestamp) {
  const date = getTimestampDate(timestamp);
  if (!date) return "";

  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const dayLabel = isSameCalendarDay(date, now)
    ? "Today"
    : isSameCalendarDay(date, yesterday)
      ? "Yesterday"
      : date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
        });

  return `${dayLabel} ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function getTranscriptItems(messages) {
  const transcriptItems = [];
  let previousMessageDate = null;

  messages.forEach((message) => {
    const messageDate = getTimestampDate(message.createdAt);
    const previousMessageTime = previousMessageDate?.getTime?.() || 0;
    const messageTime = messageDate?.getTime?.() || 0;
    const minutesSincePrevious =
      previousMessageTime && messageTime
        ? (messageTime - previousMessageTime) / 60000
        : 0;
    const shouldShowDivider =
      messageDate &&
      (!previousMessageDate ||
        !isSameCalendarDay(messageDate, previousMessageDate) ||
        minutesSincePrevious >= MESSAGE_TIME_DIVIDER_GAP_MINUTES);

    if (shouldShowDivider) {
      transcriptItems.push({
        id: `time-${message.id}`,
        type: "timeDivider",
        label: formatTranscriptTimeDivider(message.createdAt),
      });
    }

    transcriptItems.push({
      id: message.id,
      type: "message",
      message,
    });

    if (messageDate) {
      previousMessageDate = messageDate;
    }
  });

  return transcriptItems;
}

function getListingPhotoUrl(listing, conversation) {
  const s3Key =
    listing?.photos?.[0]?.s3Key ||
    conversation?.listingPhotoS3Key ||
    conversation?.listingPhotoKey ||
    "";

  return s3Key ? getS3PublicUrl(s3Key) : "";
}

function getComparableSnapshotValue(value) {
  if (!value) return value;
  if (value.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(getComparableSnapshotValue);
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = getComparableSnapshotValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function areSnapshotValuesEqual(firstValue, secondValue) {
  return (
    JSON.stringify(getComparableSnapshotValue(firstValue)) ===
    JSON.stringify(getComparableSnapshotValue(secondValue))
  );
}

function isOnlyCurrentUserReadReceiptChange(previousConversation, nextConversation, currentUserId) {
  if (!previousConversation || !nextConversation || !currentUserId) return false;

  const currentUserReadField =
    nextConversation.buyerId === currentUserId
      ? "buyerLastReadAt"
      : nextConversation.sellerId === currentUserId
        ? "sellerLastReadAt"
        : "";

  if (!currentUserReadField) return false;

  const keys = new Set([
    ...Object.keys(previousConversation),
    ...Object.keys(nextConversation),
  ]);

  for (const key of keys) {
    if (key === currentUserReadField) continue;
    if (!areSnapshotValuesEqual(previousConversation[key], nextConversation[key])) {
      return false;
    }
  }

  return true;
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
  const messageListRef = useRef(null);
  const lastReadMarkerRef = useRef("");
  const keyboardTransitioningRef = useRef(false);
  const keyboardTransitionTimeoutRef = useRef(null);

  const scrollToConversationEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({
        animated: animated && !keyboardTransitioningRef.current,
      });
    });
  }, []);

  const otherUserId =
    conversation && currentUser?.uid
      ? conversation.buyerId === currentUser.uid
        ? conversation.sellerId
        : conversation.buyerId
      : "";

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;

    function handleKeyboardTransition(event) {
      const keyboardDuration = event?.duration || IOS_KEYBOARD_LAYOUT_DURATION_MS;
      const layoutDuration = Math.min(
        keyboardDuration,
        IOS_KEYBOARD_LAYOUT_DURATION_MS
      );

      Keyboard.scheduleLayoutAnimation?.({
        ...event,
        duration: layoutDuration,
      });
      keyboardTransitioningRef.current = true;
      clearTimeout(keyboardTransitionTimeoutRef.current);

      keyboardTransitionTimeoutRef.current = setTimeout(() => {
        keyboardTransitioningRef.current = false;
        scrollToConversationEnd(false);
      }, layoutDuration + IOS_KEYBOARD_TRANSITION_BUFFER_MS);
    }

    const changeSubscription = Keyboard.addListener(
      "keyboardWillChangeFrame",
      handleKeyboardTransition
    );
    const hideSubscription = Keyboard.addListener(
      "keyboardWillHide",
      handleKeyboardTransition
    );

    return () => {
      clearTimeout(keyboardTransitionTimeoutRef.current);
      changeSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToConversationEnd]);

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
          const nextConversation = { id: snapshot.id, ...snapshot.data() };
          setConversation((previousConversation) =>
            isOnlyCurrentUserReadReceiptChange(
              previousConversation,
              nextConversation,
              currentUser?.uid
            )
              ? previousConversation
              : nextConversation
          );
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
  }, [conversationId, currentUser?.uid]);

  useEffect(() => {
    if (!conversation?.id || !currentUser?.uid) return;
    if (!isConversationUnread(conversation, currentUser.uid)) return;

    const lastMessageMarker =
      conversation.lastMessageAt?.toMillis?.() ||
      conversation.lastMessageAt?.seconds ||
      "pending";
    const readMarker = `${conversation.id}:${lastMessageMarker}`;
    if (lastReadMarkerRef.current === readMarker) return;

    lastReadMarkerRef.current = readMarker;
    markConversationAsRead(conversation.id, currentUser.uid).catch((readError) =>
      console.error("Error marking open mobile conversation read:", readError)
    );
  }, [conversation, currentUser?.uid]);

  useEffect(() => {
    if (!otherUserId || !currentUser?.uid) return undefined;

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
  }, [conversation?.listingId, currentUser?.uid, otherUserId]);
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

  const getReviewPromptState = useCallback((message) => {
    const isReviewPrompt = message.type === "review_prompt" || message.reviewPrompt;
    if (!isReviewPrompt || !currentUser?.uid) return null;

    const response = message.reviewResponses?.[currentUser.uid] || null;
    const closed = conversation?.activeSaleEventId !== message.saleEventId;

    return {
      response,
      closed,
      hidden: !response && closed,
    };
  }, [conversation?.activeSaleEventId, currentUser?.uid]);

  const transcriptItems = useMemo(
    () =>
      getTranscriptItems(
        messages.filter((message) => !getReviewPromptState(message)?.hidden)
      ),
    [getReviewPromptState, messages]
  );

  useEffect(() => {
    if (transcriptItems.length > 0) {
      scrollToConversationEnd(false);
    }
  }, [conversationId, scrollToConversationEnd, transcriptItems.length]);

  async function handleSend() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || !currentUser?.uid || sending) return;

    setSending(true);
    setDraft("");
    setError("");
    scrollToConversationEnd();
    try {
      await sendMessage(conversationId, currentUser.uid, trimmedDraft);
      scrollToConversationEnd();
    } catch (sendError) {
      console.error("Error sending mobile message:", sendError);
      setDraft(trimmedDraft);
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

  async function openReviewModal(message) {
    if (currentUser?.uid && otherUserId) {
      try {
        const existingReview = await getExistingReview(currentUser.uid, otherUserId);
        if (existingReview) {
          await updateReviewPromptResponse(message.id, currentUser.uid, "reviewed");
          return;
        }
      } catch (reviewCheckError) {
        console.error("Error checking existing mobile review:", reviewCheckError);
      }
    }

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
      if (!alreadyReviewed) {
        Alert.alert("Review submitted", "Your review has been added.");
      }
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

  const composer = (
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
  );

  return (
    <Screen>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "height" : undefined}
        contentContainerStyle={styles.container}
        style={styles.keyboardFrame}
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
        <FlatList
          ref={messageListRef}
          data={transcriptItems}
          keyExtractor={(item) => item.id}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.type === "timeDivider") {
              return (
                <View style={styles.timeDivider}>
                  <Text style={styles.timeDividerText}>{item.label}</Text>
                </View>
              );
            }

            return (
              <MessageBubble
                message={item.message}
                isMine={item.message.senderId === currentUser?.uid}
                reviewPromptState={getReviewPromptState(item.message)}
                onReviewPress={openReviewModal}
              />
            );
          }}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => scrollToConversationEnd()}
          onLayout={() => scrollToConversationEnd(false)}
          style={styles.messageScroller}
        />
        {Platform.OS === "ios" ? null : composer}
      </KeyboardAvoidingView>
      {Platform.OS === "ios" ? (
        <InputAccessoryView backgroundColor={colors.surface}>
          {composer}
        </InputAccessoryView>
      ) : null}

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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
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
              blurOnSubmit
              editable={!reportSubmitting}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={reviewOpen} transparent animationType="fade" onRequestClose={closeReviewModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
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
              blurOnSubmit
              editable={!reviewSubmitting}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
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
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardFrame: {
    flex: 1,
    overflow: "hidden",
  },
  topBar: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    elevation: 2,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 2,
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
    borderRadius: radii.card,
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
    borderRadius: radii.card,
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
    fontFamily: typography.caption.fontFamily,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  headerListingTitle: {
    ...typography.caption,
    color: colors.muted,
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
  messageScroller: {
    flex: 1,
  },
  timeDivider: {
    alignItems: "center",
    marginVertical: 8,
  },
  timeDividerText: {
    ...typography.caption,
    color: colors.muted,
    textAlign: "center",
  },
  bubble: {
    borderRadius: radii.card,
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
    ...typography.body,
    color: colors.text,
  },
  myMessageText: {
    color: "#fff",
  },
  systemText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: typography.caption.fontFamily,
    fontWeight: "500",
    textAlign: "center",
  },
  reviewPromptCard: {
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    maxWidth: "88%",
    padding: 12,
  },
  reviewPromptText: {
    ...typography.body,
    color: colors.muted,
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
    ...typography.caption,
    color: colors.primary,
  },
  reviewPromptDone: {
    ...typography.caption,
    color: colors.success,
    marginTop: 8,
  },
  reviewPromptClosed: {
    ...typography.caption,
    color: colors.muted,
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
    borderRadius: radii.control,
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
    borderRadius: radii.control,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendText: {
    ...typography.button,
    color: "#fff",
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
    borderRadius: radii.panel,
    maxHeight: "86%",
    padding: 18,
    width: "100%",
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  modalBody: {
    ...typography.body,
    color: colors.muted,
    marginTop: 8,
  },
  modalLabel: {
    ...typography.caption,
    color: colors.text,
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
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonText: {
    ...typography.caption,
    color: colors.text,
  },
  reasonTextSelected: {
    color: "#fff",
  },
  modalInput: {
    borderColor: colors.border,
    borderRadius: radii.control,
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
    ...typography.button,
    color: colors.text,
  },
  modalSubmitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.45,
  },
  modalSubmitText: {
    ...typography.button,
    color: "#fff",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    padding: 10,
    textAlign: "center",
  },
});
