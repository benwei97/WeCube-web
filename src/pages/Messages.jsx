import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Stack,
  Card,
  CardContent,
  Alert,
  Tabs,
  Tab,
} from "@mui/material";
import { Send, Check, Close, Person } from "@mui/icons-material";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserConversations,
  subscribeToUserConversations,
  subscribeToPendingRequests,
  subscribeToMessages,
  addMessage,
  markConversationAsRead,
  isConversationUnread,
  updateConversationStatus,
} from "../utils/messaging";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

const MESSAGE_TIME_DIVIDER_GAP_MINUTES = 30;

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
}) {
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Avatar
        src={listingPhotoUrl || undefined}
        variant="rounded"
        sx={{
          width: size,
          height: size,
          bgcolor: "grey.200",
        }}
      >
        <Person />
      </Avatar>
      <Avatar
        src={userAvatarUrl || undefined}
        sx={{
          position: "absolute",
          right: -4,
          bottom: -4,
          width: avatarSize,
          height: avatarSize,
          border: "2px solid",
          borderColor: "background.paper",
          bgcolor: "primary.main",
          fontSize: avatarSize <= 24 ? "0.72rem" : "0.85rem",
          fontWeight: 700,
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
  const [pendingRequests, setPendingRequests] = useState([]);
  const [listingDetails, setListingDetails] = useState({});
  const [userDetails, setUserDetails] = useState({});
  const [activeTab, setActiveTab] = useState(0); // 0 = Messages, 1 = Pending Requests
  const messagesEndRef = useRef(null);
  const messagesUnsubscribeRef = useRef(null);

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

    const unsubscribePending = subscribeToPendingRequests(
      currentUserId,
      (pending) => {
        setPendingRequests(pending);
        if (pending.length > 0) {
          loadListingDetails(pending);
          loadUserDetails(pending);
        }
      }
    );

    return () => {
      unsubscribeConversations();
      unsubscribePending();
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
          conversation.status === "approved" &&
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
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleApproveRequest = async (conversation) => {
    if (!currentUserId) return;

    try {
      await updateConversationStatus(
        conversation.id,
        "approved",
        currentUserId
      );
    } catch (error) {
      console.error("Error approving request:", error);
      alert("Failed to approve request");
    }
  };

  const handleRejectRequest = async (conversation) => {
    if (!currentUserId) return;

    try {
      await updateConversationStatus(
        conversation.id,
        "rejected",
        currentUserId
      );
    } catch (error) {
      console.error("Error rejecting request:", error);
      alert("Failed to reject request");
    }
  };

  const selectConversation = (conversation) => {
    if (
      currentUserId &&
      conversation.status === "approved" &&
      isConversationUnread(conversation, currentUserId)
    ) {
      markConversationReadLocally(conversation);
      markConversationAsRead(conversation.id, currentUserId).catch((error) =>
        console.error("Error marking conversation as read:", error)
      );
    }

    navigate(`/messages/${conversation.id}`);
  };

  const handleTabChange = (_, newValue) => {
    setActiveTab(newValue);
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

    return `https://wecube.s3.us-east-1.amazonaws.com/${firstPhoto.s3Key}`;
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
        {/* Left Panel with Tabs */}
        <Paper sx={{ width: 400, display: "flex", flexDirection: "column" }}>
          {/* Tab Header */}
          <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="fullWidth"
            >
              <Tab label="Messages" />
              <Tab
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Pending Requests
                    {pendingRequests.length > 0 && (
                      <Chip
                        label={pendingRequests.length}
                        color="error"
                        size="small"
                        sx={{
                          height: 20,
                          minWidth: 20,
                          "& .MuiChip-label": {
                            fontSize: "0.75rem",
                            px: 0.5,
                          },
                        }}
                      />
                    )}
                  </Box>
                }
              />
            </Tabs>
          </Box>

          {/* Tab Content */}
          {activeTab === 0 ? (
            /* Messages Tab */
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
          ) : (
            /* Pending Requests Tab */
            <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
              {pendingRequests.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No pending requests
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1.25}>
                  {pendingRequests.map((request) => (
                    <Card
                      key={request.id}
                      variant="outlined"
                      sx={{
                        bgcolor: "background.paper",
                        borderColor: "primary.100",
                      }}
                    >
                      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                          <ConversationIdentityThumb
                            listingPhotoUrl={getListingPhotoUrl(request.listingId)}
                            userAvatarUrl={getUserAvatarUrl(request.buyerId)}
                            userName={getUserDisplayName(request.buyerId, "Buyer")}
                            size={46}
                            avatarSize={22}
                          />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: 1,
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="body2"
                                  fontWeight={700}
                                  noWrap
                                >
                                  {getUserDisplayName(request.buyerId, "Buyer")}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  sx={{ display: "block" }}
                                >
                                  {getListingTitle(request.listingId)}
                                </Typography>
                              </Box>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  whiteSpace: "nowrap",
                                  flex: "0 0 auto",
                                  pt: 0.25,
                                }}
                              >
                                {formatTime(request.createdAt)}
                              </Typography>
                            </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                              sx={{
                                mt: 0.75,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                          >
                            {request.initialMessage}
                          </Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                              <Button
                                variant="contained"
                                color="success"
                                size="small"
                                startIcon={<Check />}
                                onClick={() => handleApproveRequest(request)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                startIcon={<Close />}
                                onClick={() => handleRejectRequest(request)}
                              >
                                Decline
                              </Button>
                            </Stack>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          )}
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
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" noWrap>
                    {getConversationCounterpartName(selectedConversation)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getListingTitle(selectedConversation.listingId)} •{" "}
                    {selectedConversation.closedAt
                      ? "Conversation closed"
                      : selectedConversation.userRole === "seller"
                        ? "Buyer inquiry"
                        : "Your inquiry"}
                    {(selectedConversation.closedAt ||
                      selectedConversation.status !== "approved") && (
                      <Chip
                        label={
                          selectedConversation.closedAt
                            ? "Status: sold"
                            : `Status: ${selectedConversation.status}`
                        }
                        size="small"
                        sx={{ ml: 1 }}
                        color={
                          selectedConversation.closedAt
                            ? "default"
                            : selectedConversation.status === "pending"
                              ? "warning"
                              : "error"
                        }
                      />
                    )}
                  </Typography>
                </Box>
              </Box>

              {/* Messages */}
                <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
                {selectedConversation.closedAt ? (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    This conversation has ended because the listing was sold.
                  </Alert>
                ) : selectedConversation.status !== "approved" && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    {selectedConversation.status === "pending"
                      ? selectedConversation.userRole === "seller"
                        ? "This buyer wants to message you about your listing. Approve to start chatting."
                        : "Your message request is pending approval from the seller."
                      : "This conversation request was declined."}
                  </Alert>
                )}

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
                  const isCurrentUserMessage = message.senderId === currentUserId;
                  const nextMessageItem = transcriptItems
                    .slice(index + 1)
                    .find((nextItem) => nextItem.type === "message");
                  const showIncomingAvatar =
                    !isCurrentUserMessage &&
                    message.type !== "system" &&
                    nextMessageItem?.message?.senderId !== message.senderId;

                  if (message.type === "system") {
                    return (
                      <Box
                        key={message.id}
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          my: 1.5,
                        }}
                      >
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 999,
                            bgcolor: "grey.100",
                            color: "text.secondary",
                            display: "inline-flex",
                            alignItems: "center",
                            maxWidth: "85%",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 500, textAlign: "center" }}
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
              {selectedConversation.status === "approved" &&
                !selectedConversation.closedAt && (
                <Box
                  sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}
                >
                  <TextField
                    fullWidth
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
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
    </Box>
  );
}

export default Messages;
