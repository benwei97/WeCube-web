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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Alert,
} from "@mui/material";
import {
  ArrowBack,
  CheckCircle,
  Flag,
  MoreVert,
  Send,
  Person,
  Star,
} from "@mui/icons-material";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import {
  subscribeToUserConversations,
  subscribeToMessages,
  addMessage,
  blockUser,
  getUserBlock,
  markConversationAsRead,
  isConversationUnread,
  unblockUser,
} from "../utils/messaging";
import { submitTransactionReview } from "../utils/reviews";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getS3PublicUrl } from "../utils/s3";
import {
  characterCountText,
  clampText,
  INPUT_LIMITS,
} from "../utils/inputLimits";
import PageState from "../components/PageState";

const MESSAGE_TIME_DIVIDER_GAP_MINUTES = 30;
const REVIEW_PROMPT_RESPONSE_STORAGE_KEY = "wecubeReviewPromptResponses";
const CONVERSATION_REPORT_REASONS = [
  { value: "scam_or_unsafe", label: "Scam or unsafe behavior" },
  { value: "harassment_or_abuse", label: "Harassment or abusive behavior" },
  { value: "payment_or_shipping_issue", label: "Payment or shipping concern" },
  { value: "suspicious_messages", label: "Suspicious messages" },
  { value: "other", label: "Other" },
];

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
                boxShadow: "0 0 0 4px rgba(47, 107, 255, 0.14)",
              }
            : undefined,
          "&:focus-visible": {
            outlineColor: "primary.main",
            boxShadow: "0 0 0 4px rgba(47, 107, 255, 0.18)",
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
                boxShadow: "0 0 0 4px rgba(47, 107, 255, 0.2)",
                transform: "scale(1.08)",
              }
            : undefined,
          "&:focus-visible": {
            outlineColor: "primary.main",
            boxShadow: "0 0 0 4px rgba(47, 107, 255, 0.24)",
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
  const [conversationMenuAnchorEl, setConversationMenuAnchorEl] = useState(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSnackbar, setReportSnackbar] = useState(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [blockedConversationIds, setBlockedConversationIds] = useState({});
  const [blockedByCurrentUserIds, setBlockedByCurrentUserIds] = useState({});
  const messagesScrollRef = useRef(null);
  const isConversationMenuOpen = Boolean(conversationMenuAnchorEl);
  const currentConversationBlockedByMe =
    Boolean(selectedConversation) &&
    Boolean(blockedByCurrentUserIds[selectedConversation.id]);

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
    const scrollElement = messagesScrollRef.current;
    if (!scrollElement) return;

    requestAnimationFrame(() => {
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior,
      });
    });
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

  const getReadFieldForConversation = useCallback((conversation) => {
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
  }, [currentUserId]);

  const markConversationReadLocally = useCallback((conversation) => {
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
  }, [getReadFieldForConversation]);

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

  const loadMessages = useCallback((convId) => {
    // Subscribe to real-time messages
    const unsubscribe = subscribeToMessages(convId, (messagesList) => {
      setMessages(messagesList);
    });

    return () => unsubscribe();
  }, []);

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
  }, [
    conversationId,
    conversations,
    currentUserId,
    loadMessages,
    markConversationReadLocally,
  ]);

  useEffect(() => {
    if (!currentUserId || !selectedConversation) {
      return undefined;
    }

    let active = true;
    const otherUserId = getConversationCounterpartId(selectedConversation);

    const loadBlockState = async () => {
      try {
        const [currentUserBlock, otherUserBlock] = await Promise.all([
          getUserBlock(currentUserId, otherUserId),
          getUserBlock(otherUserId, currentUserId),
        ]);

        if (!active) return;

        setBlockedByCurrentUserIds((prev) => ({
          ...prev,
          [selectedConversation.id]: Boolean(currentUserBlock),
        }));
        setBlockedConversationIds((prev) => ({
          ...prev,
          [selectedConversation.id]: Boolean(currentUserBlock || otherUserBlock),
        }));
      } catch (error) {
        console.error("Error loading block state:", error);
      }
    };

    loadBlockState();

    return () => {
      active = false;
    };
  }, [currentUserId, selectedConversation]);

  const handleSendMessage = async () => {
    const messageToSend = newMessage.trim();
    if (!messageToSend || !selectedConversation || !currentUserId) return;
    if (selectedConversation.closedReason === "listing_deleted") return;
    if (newMessage.length > INPUT_LIMITS.MESSAGE_TEXT) return;

    setSendingMessage(true);
    setNewMessage("");
    try {
      await addMessage(
        selectedConversation.id,
        currentUserId,
        messageToSend
      );
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageToSend);
      setReportSnackbar({
        severity: "error",
        message:
          error.message === "Messaging is not available between these accounts."
            ? "Messaging is not available between these accounts."
            : "Failed to send message",
      });
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
      setReportSnackbar({
        severity: "error",
        message: error.message || "Failed to submit review.",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const openReportDialog = () => {
    setConversationMenuAnchorEl(null);

    if (!selectedConversation || !currentUserId) {
      return;
    }

    setReportReason("");
    setReportDetails("");
    setReportDialogOpen(true);
  };

  const closeReportDialog = () => {
    if (submittingReport) return;

    setReportDialogOpen(false);
    setReportReason("");
    setReportDetails("");
  };

  const handleSubmitConversationReport = async () => {
    if (!currentUser || !selectedConversation || !reportReason) {
      return;
    }

    const reportedUserId = getConversationCounterpartId(selectedConversation);
    const reportId = `${currentUser.uid}_${selectedConversation.id}`;
    const reportRef = doc(db, "conversationReports", reportId);

    setSubmittingReport(true);
    try {
      const now = new Date();
      await setDoc(reportRef, {
        conversationId: selectedConversation.id,
        listingId: selectedConversation.listingId,
        listingTitle: getListingTitle(selectedConversation.listingId),
        reportedUserId,
        reportedUserName: getConversationCounterpartName(selectedConversation),
        reporterId: currentUser.uid,
        reporterName:
          `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
        reason: reportReason,
        details: reportDetails.trim(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });

      setReportDialogOpen(false);
      setReportReason("");
      setReportDetails("");
      setReportSnackbar({
        severity: "success",
        message: "Report submitted. We will review this conversation.",
      });
    } catch (error) {
      console.error("Error submitting conversation report:", error);
      setReportSnackbar({
        severity: error.code === "permission-denied" ? "info" : "error",
        message:
          error.code === "permission-denied"
            ? "This report could not be submitted. You may have already reported this conversation."
            : "Unable to submit this report right now. Please try again.",
      });
    } finally {
      setSubmittingReport(false);
    }
  };

  const openBlockDialog = () => {
    setConversationMenuAnchorEl(null);

    if (!selectedConversation || !currentUserId) {
      return;
    }

    setBlockDialogOpen(true);
  };

  const closeBlockDialog = () => {
    if (blockingUser) return;
    setBlockDialogOpen(false);
  };

  const handleBlockUser = async () => {
    if (!currentUser?.uid || !selectedConversation) {
      return;
    }

    const blockedUserId = getConversationCounterpartId(selectedConversation);

    setBlockingUser(true);
    try {
      await blockUser(currentUser.uid, blockedUserId);
      setBlockedConversationIds((prev) => ({
        ...prev,
        [selectedConversation.id]: true,
      }));
      setBlockedByCurrentUserIds((prev) => ({
        ...prev,
        [selectedConversation.id]: true,
      }));
      setBlockDialogOpen(false);
      setReportSnackbar({
        severity: "success",
        message: "User blocked. They can no longer message you.",
      });
    } catch (error) {
      console.error("Error blocking user:", error);
      setReportSnackbar({
        severity: "error",
        message: "Unable to block this user right now. Please try again.",
      });
    } finally {
      setBlockingUser(false);
    }
  };

  const handleUnblockUser = async () => {
    if (!currentUser?.uid || !selectedConversation) {
      return;
    }

    const blockedUserId = getConversationCounterpartId(selectedConversation);

    setBlockingUser(true);
    try {
      await unblockUser(currentUser.uid, blockedUserId);
      setBlockedConversationIds((prev) => ({
        ...prev,
        [selectedConversation.id]: false,
      }));
      setBlockedByCurrentUserIds((prev) => ({
        ...prev,
        [selectedConversation.id]: false,
      }));
      setBlockDialogOpen(false);
      setReportSnackbar({
        severity: "success",
        message: "User unblocked. You can message each other again.",
      });
    } catch (error) {
      console.error("Error unblocking user:", error);
      setReportSnackbar({
        severity: "error",
        message: "Unable to unblock this user right now. Please try again.",
      });
    } finally {
      setBlockingUser(false);
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

  const handleBackToConversations = () => {
    navigate("/messages");
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = getTimestampDate(timestamp);
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

  const getReviewPromptCounterpartId = (conversation) => {
    if (!conversation) {
      return null;
    }

    return conversation.userRole === "seller"
      ? conversation.buyerId
      : conversation.sellerId;
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
        <PageState
          variant="loading"
          title="Loading messages"
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: { xs: "100%", md: "80vw" },
        mx: "auto",
        p: { xs: 1.5, md: 3 },
        mt: { xs: 1, md: 2 },
        height: { xs: "calc(100dvh - 104px)", md: "80vh" },
        boxSizing: "border-box",
        overflow: "hidden",
        ...(selectedConversation
          ? {
              position: { xs: "fixed", md: "static" },
              inset: { xs: "88px 0 0 0", md: "auto" },
              zIndex: { xs: 1000, md: "auto" },
              height: { xs: "auto", md: "80vh" },
              mt: { xs: 0, md: 2 },
              bgcolor: "background.default",
            }
          : {}),
      }}
    >
      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        fontWeight="bold"
        sx={{ display: { xs: selectedConversation ? "none" : "block", md: "block" } }}
      >
        Messages
      </Typography>

      <Box
        sx={{
          display: "flex",
          height: {
            xs: selectedConversation ? "100%" : "calc(100% - 64px)",
            md: "calc(100% - 80px)",
          },
          gap: { xs: 0, md: 2 },
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left Panel */}
        <Paper
          sx={{
            width: { xs: "100%", md: 400 },
            display: { xs: selectedConversation ? "none" : "flex", md: "flex" },
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
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
        <Paper
          sx={{
            flex: 1,
            display: { xs: selectedConversation ? "flex" : "none", md: "flex" },
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <Box
                sx={{
                  p: { xs: 1.25, md: 2 },
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1, md: 1.5 },
                  minWidth: 0,
                }}
              >
                <IconButton
                  aria-label="Back to conversations"
                  onClick={handleBackToConversations}
                  sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}
                >
                  <ArrowBack />
                </IconButton>
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
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="h6" noWrap>
                    {getConversationCounterpartName(selectedConversation)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {getListingTitle(selectedConversation.listingId)} •{" "}
                    {selectedConversation.userRole === "seller"
                        ? "Buyer inquiry"
                        : "Your inquiry"}
                  </Typography>
                </Box>
                <IconButton
                  onClick={(event) =>
                    setConversationMenuAnchorEl(event.currentTarget)
                  }
                  aria-label="Conversation options"
                  aria-controls={
                    isConversationMenuOpen ? "conversation-actions" : undefined
                  }
                  aria-haspopup="true"
                  aria-expanded={isConversationMenuOpen ? "true" : undefined}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    color: "text.secondary",
                    flexShrink: 0,
                  }}
                >
                  <MoreVert />
                </IconButton>
                <Menu
                  id="conversation-actions"
                  anchorEl={conversationMenuAnchorEl}
                  open={isConversationMenuOpen}
                  onClose={() => setConversationMenuAnchorEl(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem onClick={openReportDialog}>
                    <Flag fontSize="small" sx={{ mr: 1.25 }} />
                    Report conversation
                  </MenuItem>
                  <MenuItem
                    onClick={openBlockDialog}
                    sx={{
                      color: currentConversationBlockedByMe
                        ? "text.primary"
                        : "error.main",
                    }}
                  >
                    <Person fontSize="small" sx={{ mr: 1.25 }} />
                    {currentConversationBlockedByMe ? "Unblock user" : "Block user"}
                  </MenuItem>
                </Menu>
              </Box>

              {/* Messages */}
                <Box
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  sx={{
                    flex: 1,
                    overflow: "auto",
                    p: { xs: 1.25, md: 2 },
                    minHeight: 0,
                  }}
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
	                          my: 1.75,
	                        }}
	                      >
	                        <Paper
	                          variant="outlined"
	                          sx={{
	                            width: "min(360px, 88%)",
	                            px: 1.75,
	                            py: 1.25,
	                            borderRadius: 1.5,
	                            borderColor: "rgba(148, 163, 184, 0.32)",
	                            bgcolor: "rgba(248, 250, 252, 0.82)",
	                            boxShadow: "none",
	                          }}
	                        >
	                          <Stack spacing={0.85} alignItems="center">
	                            <Typography
	                              variant="body2"
	                              color="text.secondary"
	                              sx={{ lineHeight: 1.45, textAlign: "center" }}
	                            >
	                              {formatReviewPromptDetail(
	                                message,
	                                selectedConversation
	                              )}
	                            </Typography>
	                            {response ? (
	                              <Stack
	                                direction="row"
	                                spacing={0.5}
	                                alignItems="center"
	                                sx={{ color: "success.main" }}
	                              >
	                                <CheckCircle sx={{ fontSize: 16 }} />
	                                <Typography variant="caption" fontWeight={700}>
	                                  You already reviewed this user.
	                                </Typography>
	                              </Stack>
	                            ) : selectedConversation.activeSaleEventId !==
	                              message.saleEventId ? (
	                              <Typography variant="caption" color="text.secondary">
	                                Review request closed.
	                              </Typography>
	                            ) : (
	                              <Button
	                                variant="outlined"
	                                size="small"
	                                onClick={() =>
	                                  openReviewDialog(message, selectedConversation)
	                                }
	                                disabled={Boolean(isPromptClosed)}
	                                sx={{
	                                  mt: 0.25,
	                                  minHeight: 30,
	                                  borderRadius: 1,
	                                  px: 1.5,
	                                  fontWeight: 700,
	                                }}
	                              >
	                                Rate your experience
	                              </Button>
	                            )}
	                          </Stack>
	                        </Paper>
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
	                          my: 1.75,
	                        }}
	                      >
	                        <Typography
	                          variant="caption"
	                          color="text.secondary"
	                          sx={{
	                            maxWidth: "85%",
	                            textAlign: "center",
	                            lineHeight: 1.45,
	                          }}
	                        >
	                          {message.text}
	                        </Typography>
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
                          maxWidth: { xs: "82%", md: "70%" },
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
                              ? "0 4px 12px rgba(47, 107, 255, 0.18)"
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
                  sx={{
                    px: { xs: 1, md: 2 },
                    pt: { xs: 0.75, md: 2 },
                    pb: { xs: 0, md: 2 },
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Alert severity="info" variant="outlined">
                    This listing was deleted, so the conversation is closed.
                  </Alert>
                </Box>
              ) : blockedConversationIds[selectedConversation.id] ? (
                <Box
                  sx={{
                    px: { xs: 1, md: 2 },
                    pt: { xs: 0.75, md: 2 },
                    pb: { xs: 0, md: 2 },
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Alert severity="info" variant="outlined">
                    {currentConversationBlockedByMe
                      ? "You blocked this user, so this conversation is closed for messaging."
                      : "Messaging is not available between these accounts."}
                  </Alert>
                </Box>
              ) : selectedConversation.status !== "rejected" && (
                <Box
                  sx={{
                    px: { xs: 1, md: 2 },
                    pt: { xs: 0.75, md: 2 },
                    pb: { xs: 0, md: 2 },
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
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
	        <DialogTitle>
	          Rate your experience with{" "}
	          {reviewDialog.conversation
	            ? getConversationCounterpartName(reviewDialog.conversation)
	            : "this user"}
	        </DialogTitle>
	        <DialogContent>
	          <Stack spacing={2} sx={{ mt: 1 }}>
	            <Stack alignItems="center">
	              <Avatar
	                src={
	                  getUserAvatarUrl(
	                    getReviewPromptCounterpartId(reviewDialog.conversation)
	                  ) || undefined
	                }
	                sx={{ width: 96, height: 96, fontSize: "2rem" }}
	              >
	                {reviewDialog.conversation
	                  ? getConversationCounterpartName(reviewDialog.conversation)
	                      .charAt(0)
	                      .toUpperCase()
	                  : "U"}
	              </Avatar>
	            </Stack>
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
                inputLabel: {
                  sx: {
                    "&.MuiInputLabel-shrink": {
                      bgcolor: { xs: "background.paper", sm: "transparent" },
                      px: { xs: 0.5, sm: 0 },
                      mx: { xs: -0.5, sm: 0 },
                    },
                  },
                },
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

      <Dialog
        open={reportDialogOpen}
        onClose={closeReportDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Report Conversation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <DialogContentText>
              Tell us what happened. Reports help us review unsafe or abusive
              marketplace conversations. Review the{" "}
              <Box component={Link} to="/safety" sx={{ color: "primary.main" }}>
                safety guidelines
              </Box>
              .
            </DialogContentText>
            <FormControl fullWidth required>
              <InputLabel id="conversation-report-reason-label">Reason</InputLabel>
              <Select
                labelId="conversation-report-reason-label"
                label="Reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                disabled={submittingReport}
              >
                {CONVERSATION_REPORT_REASONS.map((reason) => (
                  <MenuItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Details"
              multiline
              minRows={4}
              value={reportDetails}
              onChange={(event) =>
                setReportDetails(
                  clampText(event.target.value, INPUT_LIMITS.REPORT_DETAILS)
                )
              }
              disabled={submittingReport}
              helperText={characterCountText(
                reportDetails,
                INPUT_LIMITS.REPORT_DETAILS
              )}
              slotProps={{
                htmlInput: {
                  maxLength: INPUT_LIMITS.REPORT_DETAILS,
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReportDialog} color="inherit" disabled={submittingReport}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitConversationReport}
            variant="contained"
            disabled={submittingReport || !reportReason}
          >
            {submittingReport ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={blockDialogOpen}
        onClose={closeBlockDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {currentConversationBlockedByMe ? "Unblock User" : "Block User"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {currentConversationBlockedByMe ? "Unblock " : "Block "}
            {selectedConversation
              ? getConversationCounterpartName(selectedConversation)
              : "this user"}
            ?{" "}
            {currentConversationBlockedByMe
              ? "You will be able to message each other again."
              : "They will not be able to start or continue conversations with you."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBlockDialog} color="inherit" disabled={blockingUser}>
            Cancel
          </Button>
          <Button
            onClick={
              currentConversationBlockedByMe ? handleUnblockUser : handleBlockUser
            }
            color={currentConversationBlockedByMe ? "primary" : "error"}
            variant="contained"
            disabled={blockingUser}
          >
            {blockingUser
              ? currentConversationBlockedByMe
                ? "Unblocking..."
                : "Blocking..."
              : currentConversationBlockedByMe
                ? "Unblock User"
                : "Block User"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(reportSnackbar)}
        autoHideDuration={3600}
        onClose={() => setReportSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {reportSnackbar && (
          <Alert
            onClose={() => setReportSnackbar(null)}
            severity={reportSnackbar.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {reportSnackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}

export default Messages;
