import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Stack,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
} from "@mui/material";
import { Send, Person, Star } from "@mui/icons-material";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserConversations,
  subscribeToUserConversations,
  subscribeToMessages,
  addMessage,
  markConversationAsRead,
  isConversationUnread,
} from "../utils/messaging";
import { submitTransactionReview } from "../utils/reviews";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getS3PublicUrl } from "../utils/s3";
import {
  characterCountText,
  clampText,
  INPUT_LIMITS,
} from "../utils/inputLimits";

const MESSAGE_TIME_DIVIDER_GAP_MINUTES = 30;
const REVIEW_PROMPT_RESPONSE_STORAGE_KEY = "wecubeReviewPromptResponses";

function getTimestampDate(timestamp) {
  if (!timestamp) {
    return null;
  }

  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

function isSameCalendarDay(firstDate, secondDate) {
  return (
    firstDate?.getFullYear() === secondDate?.getFullYear() &&
    firstDate?.getMonth() === secondDate?.getMonth() &&
    firstDate?.getDate() === secondDate?.getDate()
  );
}

function ConversationIdentityThumb({
  listingPhotoUrl,
  userAvatarUrl,
  userName,
  size = 52,
  avatarSize = 24,
  onListingClick,
  onUserClick,
}) {
  const handleKeyboardClick = (event, handler) => {
    if (!handler || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handler(event);
  };

  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Avatar
        role={onListingClick ? "button" : undefined}
        tabIndex={onListingClick ? 0 : undefined}
        src={listingPhotoUrl || undefined}
        variant="rounded"
        onClick={(event) => {
          if (!onListingClick) return;
          event.stopPropagation();
          onListingClick(event);
        }}
        onKeyDown={(event) => handleKeyboardClick(event, onListingClick)}
        sx={{
          width: size,
          height: size,
          bgcolor: "grey.200",
          cursor: onListingClick ? "pointer" : "default",
          transition: "box-shadow 0.18s ease, outline-color 0.18s ease",
          outline: "2px solid transparent",
          outlineOffset: 2,
          "&:hover": onListingClick
            ? {
                outlineColor: "primary.main",
                boxShadow: "0 0 0 4px rgba(100, 108, 255, 0.14)",
              }
            : undefined,
          "&:focus-visible": {
            outlineColor: "primary.main",
            boxShadow: "0 0 0 4px rgba(100, 108, 255, 0.18)",
          },
        }}
      >
        <Person />
      </Avatar>
      <Avatar
        role={onUserClick ? "button" : undefined}
        tabIndex={onUserClick ? 0 : undefined}
        src={userAvatarUrl || undefined}
        onClick={(event) => {
          if (!onUserClick) return;
          event.stopPropagation();
          onUserClick(event);
        }}
        onKeyDown={(event) => handleKeyboardClick(event, onUserClick)}
        sx={{
          position: "absolute",
          right: -4,
          bottom: -4,
          zIndex: 1,
          width: avatarSize,
          height: avatarSize,
          border: "2px solid",
          borderColor: "background.paper",
          bgcolor: "primary.main",
          fontSize: avatarSize <= 24 ? "0.72rem" : "0.85rem",
          fontWeight: 700,
          cursor: onUserClick ? "pointer" : "default",
          transition:
            "box-shadow 0.18s ease, outline-color 0.18s ease, transform 0.18s ease",
          outline: "2px solid transparent",
          outlineOffset: 2,
          "&:hover": onUserClick
            ? {
                outlineColor: "primary.main",
                boxShadow: "0 0 0 4px rgba(100, 108, 255, 0.2)",
                transform: "scale(1.08)",
              }
            : undefined,
          "&:focus-visible": {
            outlineColor: "primary.main",
            boxShadow: "0 0 0 4px rgba(100, 108, 255, 0.24)",
            transform: "scale(1.08)",
          },
        }}
      >
        {userName?.charAt(0)?.toUpperCase() || "U"}
      </Avatar>
    </Box>
  );
}

function Messages() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.uid || null;
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [listingDetails, setListingDetails] = useState({});
  const [userDetails, setUserDetails] = useState({});
  const [reviewDialog, setReviewDialog] = useState({
    open: false,
    message: null,
    conversation: null,
  });
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewPromptResponses, setReviewPromptResponses] = useState({});
  const messagesScrollRef = useRef(null);

  const getReviewPromptResponseKey = (messageId) =>
    currentUserId && messageId ? `${currentUserId}:${messageId}` : null;

  const saveReviewPromptResponse = (messageId, response) => {
    const responseKey = getReviewPromptResponseKey(messageId);
    if (!responseKey) return;

    setReviewPromptResponses((prev) => {
      const next = {
        ...prev,
        [responseKey]: response,
      };
      window.localStorage.setItem(
        REVIEW_PROMPT_RESPONSE_STORAGE_KEY,
        JSON.stringify(next)
      );
      return next;
    });
  };

  const getReviewPromptResponse = (message) => {
    const responseKey = getReviewPromptResponseKey(message?.id);
    return (
      message?.reviewResponses?.[currentUserId] ||
      (responseKey ? reviewPromptResponses[responseKey] : null)
    );
  };
  const messagesEndRef = useRef(null);
  const messagesUnsubscribeRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const previousConversationIdRef = useRef(null);
  const previousNewestMessageIdRef = useRef(null);
  const userNearBottomRef = useRef(true);

  useEffect(() => {
    if (!currentUserId) {
      setReviewPromptResponses({});
      return;
    }

    try {
      const storedResponses = window.localStorage.getItem(
        REVIEW_PROMPT_RESPONSE_STORAGE_KEY
      );
      setReviewPromptResponses(
        storedResponses ? JSON.parse(storedResponses) : {}
      );
    } catch (error) {
      console.error("Error loading review prompt responses:", error);
      setReviewPromptResponses({});
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      navigate("/");
      return;
    }

    loadConversations();
    setLoading(true);

    const unsubscribeConversations = subscribeToUserConversations(
      currentUserId,
      (updatedConversations) => {
        setConversations(updatedConversations);
        loadListingDetails(updatedConversations);
        loadUserDetails(updatedConversations);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeConversations();
    };
  }, [currentUserId, navigate]);

  useEffect(() => {
    if (!currentUserId) {
      return undefined;
    }

    if (conversationId) {
      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
        if (
          conversation.status !== "rejected" &&
          isConversationUnread(conversation, currentUserId)
        ) {
          markConversationReadLocally(conversation);
          markConversationAsRead(conversation.id, currentUserId).catch((error) =>
            console.error("Error marking conversation as read:", error)
          );
        }
        if (messagesUnsubscribeRef.current) {
          messagesUnsubscribeRef.current();
        }
        messagesUnsubscribeRef.current = loadMessages(conversationId);
      }
    } else {
      setSelectedConversation(null);
      setMessages([]);
    }

    return () => {
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
        messagesUnsubscribeRef.current = null;
      }
    };
  }, [conversationId, conversations, currentUserId]);

  useEffect(() => {
    const currentConversationId = selectedConversation?.id || null;
    const conversationChanged =
      previousConversationIdRef.current !== currentConversationId;
    const newestMessage = messages[messages.length - 1];
    const newestMessageId = newestMessage?.id || null;
    const newestMessageChanged =
      newestMessageId &&
      newestMessageId !== previousNewestMessageIdRef.current;
    const newestMessageIsMine = newestMessage?.senderId === currentUserId;

    if (conversationChanged) {
      userNearBottomRef.current = true;
      scrollToBottom(conversationChanged ? "auto" : "smooth");
    } else if (
      newestMessageChanged &&
      (userNearBottomRef.current || newestMessageIsMine)
    ) {
      scrollToBottom("smooth");
    }

    previousMessageCountRef.current = messages.length;
    previousConversationIdRef.current = currentConversationId;
    previousNewestMessageIdRef.current = newestMessageId;
  }, [messages, selectedConversation?.id, currentUserId]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleMessagesScroll = () => {
    const scrollElement = messagesScrollRef.current;
    if (!scrollElement) {
      userNearBottomRef.current = true;
      return;
    }

    userNearBottomRef.current =
      scrollElement.scrollHeight -
        scrollElement.scrollTop -
        scrollElement.clientHeight <
      120;
  };

  const getReadFieldForConversation = (conversation) => {
    if (!currentUserId) {
      return null;
    }

    if (conversation.buyerId === currentUserId) {
      return "buyerLastReadAt";
    }

    if (conversation.sellerId === currentUserId) {
      return "sellerLastReadAt";
    }

    return null;
  };

  const markConversationReadLocally = (conversation) => {
    const readField = getReadFieldForConversation(conversation);

    if (!readField) {
      return;
    }

    const now = new Date();

    setConversations((prev) =>
      prev.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              [readField]: {
                toMillis: () => now.getTime(),
                toDate: () => now,
              },
            }
          : item
      )
    );
  };

  const loadConversations = async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    try {
      const userConversations = await getUserConversations(currentUserId);
      setConversations(userConversations);
      await loadListingDetails(userConversations);
      await loadUserDetails(userConversations);
      setLoading(false);
    } catch (error) {
      console.error("Error loading conversations:", error);
      setLoading(false);
    }
  };

  const loadListingDetails = async (conversationsList) => {
    const details = {};
    for (const conversation of conversationsList) {
      if (!details[conversation.listingId]) {
        try {
          const listingDoc = await getDoc(
            doc(db, "listings", conversation.listingId)
          );
          if (listingDoc.exists()) {
            details[conversation.listingId] = listingDoc.data();
          }
        } catch (error) {
          console.error("Error loading listing details:", error);
        }
      }
    }
    setListingDetails((prev) => ({ ...prev, ...details }));
  };

  const loadUserDetails = async (conversationsList) => {
    const details = {};
    for (const conversation of conversationsList) {
      // Load buyer details
      if (conversation.buyerId && !details[conversation.buyerId]) {
        try {
          const userDoc = await getDoc(doc(db, "users", conversation.buyerId));
          if (userDoc.exists()) {
            details[conversation.buyerId] = userDoc.data();
          }
        } catch (error) {
          console.error("Error loading buyer details:", error);
        }
      }

      // Load seller details
      if (conversation.sellerId && !details[conversation.sellerId]) {
        try {
          const userDoc = await getDoc(doc(db, "users", conversation.sellerId));
          if (userDoc.exists()) {
            details[conversation.sellerId] = userDoc.data();
          }
        } catch (error) {
          console.error("Error loading seller details:", error);
        }
      }
    }
    setUserDetails((prev) => ({ ...prev, ...details }));
  };

  const loadMessages = (convId) => {
    // Subscribe to real-time messages
    const unsubscribe = subscribeToMessages(convId, (messagesList) => {
      setMessages(messagesList);
    });

    return () => unsubscribe();
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !currentUserId) return;
    if (selectedConversation.closedReason === "listing_deleted") return;
    if (newMessage.length > INPUT_LIMITS.MESSAGE_TEXT) return;

    setSendingMessage(true);
    try {
      await addMessage(
        selectedConversation.id,
        currentUserId,
        newMessage.trim()
      );
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const openReviewDialog = (message, conversation) => {
    setReviewDialog({
      open: true,
      message,
      conversation,
    });
    setReviewForm({
      rating: 5,
      comment: "",
    });
  };

  const closeReviewDialog = () => {
    if (submittingReview) return;
    setReviewDialog({
      open: false,
      message: null,
      conversation: null,
    });
    setReviewForm({
      rating: 5,
      comment: "",
    });
  };

  const handleReviewSubmit = async () => {
    if (!currentUser || !reviewDialog.message || !reviewDialog.conversation) {
      return;
    }

    const conversation = reviewDialog.conversation;
    const recipientId = getConversationCounterpartId(conversation);
    const recipientRole = conversation.userRole === "seller" ? "buyer" : "seller";
    const listingDetailsForReview = listingDetails[conversation.listingId] || {};
    const listing = {
      id: conversation.listingId,
      ...listingDetailsForReview,
      title: listingDetailsForReview.title || "Listing",
      userId: conversation.sellerId,
      buyerId: conversation.buyerId,
      saleEventId:
        reviewDialog.message.saleEventId ||
        conversation.activeSaleEventId ||
        listingDetailsForReview.saleEventId ||
        null,
    };

    setSubmittingReview(true);
    try {
      await submitTransactionReview({
        listing,
        reviewer: currentUser,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        recipientId,
        recipientName: getConversationCounterpartName(conversation),
        recipientRole,
        saleEventId: reviewDialog.message.saleEventId || conversation.activeSaleEventId || null,
      });
      saveReviewPromptResponse(reviewDialog.message.id, "reviewed");
      closeReviewDialog();
    } catch (error) {
      console.error("Error submitting conversation review:", error);
      alert(error.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const selectConversation = (conversation) => {
    if (
      currentUserId &&
      conversation.status !== "rejected" &&
      isConversationUnread(conversation, currentUserId)
    ) {
      markConversationReadLocally(conversation);
      markConversationAsRead(conversation.id, currentUserId).catch((error) =>
        console.error("Error marking conversation as read:", error)
      );
    }

    navigate(`/messages/${conversation.id}`);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = getTimestampDate(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatTranscriptTimeDivider = (timestamp) => {
    const date = getTimestampDate(timestamp);

    if (!date) {
      return "";
    }

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
            year:
              date.getFullYear() === now.getFullYear()
                ? undefined
                : "numeric",
          });

    return `${dayLabel} ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  };

  const getTranscriptItems = () => {
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
  };

  const formatLastMessagePreview = (conversation) => {
    if (!conversation.lastMessage) return "No messages yet";

    if (conversation.lastMessageReviewPrompt) {
      return formatReviewPromptText(conversation, conversation);
    }

    if (
      conversation.lastMessageType === "system" ||
      conversation.lastMessage === "Conversation approved. You can now message freely!"
    ) {
      return conversation.lastMessage;
    }

    // Determine who sent the last message
    const lastMessageSenderId = conversation.lastMessageSenderId;

    if (!lastMessageSenderId) {
      // Fallback for older messages without senderId
      return conversation.lastMessage;
    }

    let senderName = "";

    if (lastMessageSenderId === currentUserId) {
      senderName = "You";
    } else if (lastMessageSenderId === conversation.buyerId) {
      // This is the buyer
      const buyerDetails = userDetails[conversation.buyerId];
      senderName = buyerDetails?.firstName || "Buyer";
    } else if (lastMessageSenderId === conversation.sellerId) {
      // This is the seller
      const sellerDetails = userDetails[conversation.sellerId];
      senderName = sellerDetails?.firstName || "Seller";
    }

    return `${senderName}: ${conversation.lastMessage}`;
  };

  const getReviewPromptCounterpartName = (conversation, source = {}) => {
    if (!conversation) {
      return "this user";
    }

    if (conversation.userRole === "seller") {
      return (
        source.buyerName ||
        getUserDisplayName(conversation.buyerId, "Buyer")
      );
    }

    return (
      source.sellerName ||
      getUserDisplayName(conversation.sellerId, "Seller")
    );
  };

  const formatReviewPromptText = (source = {}, conversation = null) => {
    const counterpartName = getReviewPromptCounterpartName(conversation, source);
    const sellerName =
      source.sellerName ||
      getUserDisplayName(conversation?.sellerId, "Seller");
    const listingTitle =
      source.listingTitle ||
      source.lastMessageListingTitle ||
      getListingTitle(conversation?.listingId);

    return `Rate your experience with ${counterpartName}. ${sellerName} marked "${listingTitle}" as sold.`;
  };

  const formatReviewPromptTitle = (source = {}, conversation = null) => {
    const counterpartName = getReviewPromptCounterpartName(conversation, source);

    return `Rate your experience with ${counterpartName}`;
  };

  const formatReviewPromptDetail = (source = {}, conversation = null) => {
    const sellerName =
      source.sellerName ||
      getUserDisplayName(conversation?.sellerId, "Seller");
    const listingTitle =
      source.listingTitle ||
      source.lastMessageListingTitle ||
      getListingTitle(conversation?.listingId);

    return `${sellerName} marked "${listingTitle}" as sold.`;
  };

  const isUnreadConversation = (conversation) => {
    if (!currentUserId || conversation.id === selectedConversation?.id) {
      return false;
    }

    return isConversationUnread(conversation, currentUserId);
  };

  const getUserDisplayName = (userId, fallbackLabel) => {
    const user = userDetails[userId];

    if (!user) {
      return fallbackLabel;
    }

    return user.firstName || user.displayName || fallbackLabel;
  };

  const getUserAvatarUrl = (userId) => {
    const user = userDetails[userId];

    return user?.avatarUrl || user?.photoURL || null;
  };

  const getConversationCounterpartId = (conversation) => {
    return conversation.userRole === "seller"
      ? conversation.buyerId
      : conversation.sellerId;
  };

  const getListingTitle = (listingId) => {
    return listingDetails[listingId]?.title || "Unknown Listing";
  };

  const isListingDeletedConversation = (conversation) =>
    conversation?.closedReason === "listing_deleted";

  const getConversationCounterpartName = (conversation) => {
    const counterpartId = getConversationCounterpartId(conversation);
    const fallbackLabel = conversation.userRole === "seller" ? "Buyer" : "Seller";

    return getUserDisplayName(counterpartId, fallbackLabel);
  };

  const getListingPhotoUrl = (listingId) => {
    const listing = listingDetails[listingId];
    const firstPhoto = listing?.photos?.[0];

    if (!firstPhoto?.s3Key) {
      return null;
    }

    return getS3PublicUrl(firstPhoto.s3Key);
  };

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2, height: "80vh" }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Messages
      </Typography>

      <Box sx={{ display: "flex", height: "calc(100% - 80px)", gap: 2 }}>
        {/* Left Panel */}
        <Paper sx={{ width: 400, display: "flex", flexDirection: "column" }}>
          <List sx={{ flex: 1, overflow: "auto" }}>
            {conversations.map((conversation) => (
              <ListItem
                key={conversation.id}
                component="button"
                selected={selectedConversation?.id === conversation.id}
                onClick={() => selectConversation(conversation)}
                sx={{
                  "&.Mui-selected": {
                    bgcolor: "primary.50",
                  },
                  cursor: "pointer",
                  width: "100%",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <ListItemAvatar>
                  <ConversationIdentityThumb
                    listingPhotoUrl={getListingPhotoUrl(conversation.listingId)}
                    userAvatarUrl={getUserAvatarUrl(
                      getConversationCounterpartId(conversation)
                    )}
                    userName={getConversationCounterpartName(conversation)}
                    onListingClick={() =>
                      navigate(`/listing/${conversation.listingId}`)
                    }
                    onUserClick={() =>
                      navigate(`/user/${getConversationCounterpartId(conversation)}`)
                    }
                  />
                </ListItemAvatar>
                <ListItemText
                  sx={{ minWidth: 0 }}
                  primary={
                    <Typography
                      variant="body1"
                      fontWeight={isUnreadConversation(conversation) ? "bold" : "medium"}
                      noWrap
                    >
                      {getConversationCounterpartName(conversation)}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ display: "block" }}
                      >
                        {getListingTitle(conversation.listingId)}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        fontWeight={isUnreadConversation(conversation) ? "medium" : "regular"}
                      >
                        {formatLastMessagePreview(conversation)}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemText
                  sx={{
                    flex: "0 0 72px",
                    ml: 1,
                    alignSelf: "flex-start",
                  }}
                  primary={
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      {isUnreadConversation(conversation) && (
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            bgcolor: "error.main",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {conversation.lastMessageAt && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          {formatTime(conversation.lastMessageAt)}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
            {conversations.length === 0 && (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  No conversations yet
                </Typography>
              </Box>
            )}
          </List>
        </Paper>

        {/* Chat Area */}
        <Paper sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <Box
                sx={{
                  p: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <ConversationIdentityThumb
                  listingPhotoUrl={getListingPhotoUrl(
                    selectedConversation.listingId
                  )}
                  userAvatarUrl={getUserAvatarUrl(
                    getConversationCounterpartId(selectedConversation)
                  )}
                  userName={getConversationCounterpartName(
                    selectedConversation
                  )}
                  onListingClick={
                    isListingDeletedConversation(selectedConversation)
                      ? undefined
                      : () => navigate(`/listing/${selectedConversation.listingId}`)
                  }
                  onUserClick={() =>
                    navigate(
                      `/user/${getConversationCounterpartId(selectedConversation)}`
                    )
                  }
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" noWrap>
                    {getConversationCounterpartName(selectedConversation)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getListingTitle(selectedConversation.listingId)} •{" "}
                    {selectedConversation.userRole === "seller"
                        ? "Buyer inquiry"
                        : "Your inquiry"}
                  </Typography>
                </Box>
              </Box>

              {/* Messages */}
                <Box
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  sx={{ flex: 1, overflow: "auto", p: 2 }}
                >
                {getTranscriptItems().map((item, index, transcriptItems) => {
                  if (item.type === "timeDivider") {
                    return (
                      <Box
                        key={item.id}
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          my: 2,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            bgcolor: "background.default",
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 999,
                            px: 1.5,
                            py: 0.5,
                            fontWeight: 600,
                          }}
                        >
                          {item.label}
                        </Typography>
                      </Box>
                    );
                  }

                  const { message } = item;
                  const isReviewPrompt =
                    message.type === "review_prompt" || message.reviewPrompt;
                  const isCurrentUserMessage = message.senderId === currentUserId;
                  const nextMessageItem = transcriptItems
                    .slice(index + 1)
                    .find((nextItem) => nextItem.type === "message");
                  const showIncomingAvatar =
                    !isCurrentUserMessage &&
                    message.type !== "system" &&
                    !isReviewPrompt &&
                    nextMessageItem?.message?.senderId !== message.senderId;

                  if (isReviewPrompt) {
                    const response = getReviewPromptResponse(message);
                    const isPromptClosed =
                      selectedConversation.activeSaleEventId !==
                        message.saleEventId || response;

                    if (
                      !response &&
                      selectedConversation.activeSaleEventId !==
                        message.saleEventId
                    ) {
                      return null;
                    }

                    return (
                      <Box
                        key={message.id}
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          my: 2,
                        }}
                      >
                        <Card
                          variant="outlined"
                          sx={{
                            maxWidth: 420,
                            width: "100%",
                            borderColor: "primary.main",
                            bgcolor: "background.paper",
                          }}
                        >
                          <CardContent>
                            <Stack spacing={1.5}>
                              <Typography variant="body1" fontWeight={700}>
                                {formatReviewPromptTitle(
                                  message,
                                  selectedConversation
                                )}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {formatReviewPromptDetail(
                                  message,
                                  selectedConversation
                                )}
                              </Typography>
                              {response ? (
                                <Alert severity="success">
                                  Review submitted.
                                </Alert>
                              ) : selectedConversation.activeSaleEventId !==
                                message.saleEventId ? (
                                <Alert severity="info">
                                  This review request is no longer active.
                                </Alert>
                              ) : (
                                <Button
                                  variant="contained"
                                  onClick={() =>
                                    openReviewDialog(message, selectedConversation)
                                  }
                                  disabled={Boolean(isPromptClosed)}
                                  sx={{ alignSelf: "flex-start" }}
                                >
                                  Rate
                                </Button>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Box>
                    );
                  }

                  if (message.type === "system") {
                    return (
                      <Box
                        key={message.id}
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          my: 2,
                        }}
                      >
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 999,
                            bgcolor: "rgba(100, 108, 255, 0.08)",
                            color: "text.primary",
                            border: "1px solid",
                            borderColor: "rgba(100, 108, 255, 0.18)",
                            display: "inline-flex",
                            alignItems: "center",
                            maxWidth: "85%",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, textAlign: "center" }}
                          >
                            {message.text}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  }

                  return (
                    <Box
                      key={message.id}
                      sx={{
                        display: "flex",
                        justifyContent:
                          isCurrentUserMessage ? "flex-end" : "flex-start",
                        alignItems: "flex-end",
                        gap: 1,
                        mb: 0.75,
                        pl: isCurrentUserMessage ? 0 : 0.5,
                      }}
                    >
                      {!isCurrentUserMessage && (
                        showIncomingAvatar ? (
                          <Avatar
                            src={
                              getUserAvatarUrl(message.senderId) || undefined
                            }
                            sx={{
                              width: 28,
                              height: 28,
                              fontSize: "0.78rem",
                              flexShrink: 0,
                            }}
                          >
                            {getUserDisplayName(message.senderId, "User")
                              .charAt(0)
                              .toUpperCase()}
                          </Avatar>
                        ) : (
                          <Box sx={{ width: 28, flexShrink: 0 }} />
                        )
                      )}
                      <Box
                        sx={{
                          px: 1.75,
                          py: 1.1,
                          maxWidth: "70%",
                          borderRadius:
                            isCurrentUserMessage
                              ? "20px 20px 6px 20px"
                              : "20px 20px 20px 6px",
                          bgcolor:
                            isCurrentUserMessage
                              ? "primary.main"
                              : "grey.100",
                          color:
                            isCurrentUserMessage
                              ? "white"
                              : "text.primary",
                          boxShadow:
                            isCurrentUserMessage
                              ? "0 4px 12px rgba(25, 118, 210, 0.18)"
                              : "none",
                        }}
                      >
                        <Typography
                          variant="body1"
                          sx={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {message.text}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                <div ref={messagesEndRef} />
              </Box>

              {/* Message Input */}
              {isListingDeletedConversation(selectedConversation) ? (
                <Box
                  sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}
                >
                  <Alert severity="info" variant="outlined">
                    This listing was deleted, so the conversation is closed.
                  </Alert>
                </Box>
              ) : selectedConversation.status !== "rejected" && (
                <Box
                  sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}
                >
                  <TextField
                    fullWidth
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) =>
                      setNewMessage(
                        clampText(e.target.value, INPUT_LIMITS.MESSAGE_TEXT)
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={handleSendMessage}
                              disabled={!newMessage.trim() || sendingMessage}
                              color="primary"
                            >
                              <Send />
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                      htmlInput: {
                        maxLength: INPUT_LIMITS.MESSAGE_TEXT,
                      },
                    }}
                  />
                </Box>
              )}
            </>
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography variant="h6" color="text.secondary">
                Select a conversation to start messaging
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      <Dialog
        open={reviewDialog.open}
        onClose={closeReviewDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rate your experience</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {getListingTitle(reviewDialog.conversation?.listingId)} with{" "}
              {reviewDialog.conversation
                ? getConversationCounterpartName(reviewDialog.conversation)
                : "this user"}
            </Typography>
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Rating
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <IconButton
                    key={value}
                    aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                    onClick={() =>
                      setReviewForm((prev) => ({
                        ...prev,
                        rating: value,
                      }))
                    }
                    size="small"
                    sx={{
                      color:
                        value <= reviewForm.rating
                          ? "primary.main"
                          : "action.disabled",
                    }}
                  >
                    <Star />
                  </IconButton>
                ))}
              </Stack>
            </Box>
            <TextField
              label="Review"
              multiline
              minRows={4}
              value={reviewForm.comment}
              onChange={(event) =>
                setReviewForm((prev) => ({
                  ...prev,
                  comment: clampText(
                    event.target.value,
                    INPUT_LIMITS.REVIEW_COMMENT
                  ),
                }))
              }
              placeholder="Share how the experience went."
              helperText={characterCountText(
                reviewForm.comment,
                INPUT_LIMITS.REVIEW_COMMENT
              )}
              slotProps={{
                htmlInput: {
                  maxLength: INPUT_LIMITS.REVIEW_COMMENT,
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeReviewDialog}
            color="inherit"
            disabled={submittingReview}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReviewSubmit}
            variant="contained"
            disabled={submittingReview}
          >
            Save Review
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Messages;
