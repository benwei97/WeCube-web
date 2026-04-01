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
import { Send, Check, Close, Person, AccessTime } from "@mui/icons-material";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserConversations,
  subscribeToUserConversations,
  subscribeToMessages,
  addMessage,
  updateConversationStatus,
  getPendingRequests,
} from "../utils/messaging";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

function Messages() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
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
    if (!currentUser) {
      navigate("/");
      return;
    }

    loadConversations();
    loadPendingRequests();

    // Subscribe to real-time conversation updates
    const unsubscribe = subscribeToUserConversations(
      currentUser.uid,
      (updatedConversations) => {
        setConversations(updatedConversations);
        loadListingDetails(updatedConversations);
        loadUserDetails(updatedConversations);
        loadPendingRequests();
      }
    );

    return () => unsubscribe();
  }, [currentUser, navigate]);

  useEffect(() => {
    if (conversationId) {
      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
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
  }, [conversationId, conversations]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadConversations = async () => {
    try {
      const userConversations = await getUserConversations(currentUser.uid);
      setConversations(userConversations);
      await loadListingDetails(userConversations);
      await loadUserDetails(userConversations);
      setLoading(false);
    } catch (error) {
      console.error("Error loading conversations:", error);
      setLoading(false);
    }
  };

  const loadPendingRequests = async () => {
    try {
      console.log("Loading pending requests for user:", currentUser.uid);
      const pending = await getPendingRequests(currentUser.uid);
      console.log("Found pending requests:", pending);
      setPendingRequests(pending);

      // Load listing details for pending requests
      if (pending.length > 0) {
        await loadListingDetails(pending);
        await loadUserDetails(pending);
      }
    } catch (error) {
      console.error("Error loading pending requests:", error);
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
    if (!newMessage.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      await addMessage(
        selectedConversation.id,
        currentUser.uid,
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
    try {
      await updateConversationStatus(
        conversation.id,
        "approved",
        currentUser.uid
      );
      await loadPendingRequests();
      await loadConversations();
    } catch (error) {
      console.error("Error approving request:", error);
      alert("Failed to approve request");
    }
  };

  const handleRejectRequest = async (conversation) => {
    try {
      await updateConversationStatus(
        conversation.id,
        "rejected",
        currentUser.uid
      );
      await loadPendingRequests();
      await loadConversations();
    } catch (error) {
      console.error("Error rejecting request:", error);
      alert("Failed to reject request");
    }
  };

  const selectConversation = (conversation) => {
    navigate(`/messages/${conversation.id}`);
  };

  const handleTabChange = (_, newValue) => {
    setActiveTab(newValue);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatLastMessagePreview = (conversation) => {
    if (!conversation.lastMessage) return "No messages yet";

    // Determine who sent the last message
    const lastMessageSenderId = conversation.lastMessageSenderId;

    if (!lastMessageSenderId) {
      // Fallback for older messages without senderId
      return conversation.lastMessage;
    }

    let senderName = "";

    if (lastMessageSenderId === currentUser.uid) {
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
                    <Avatar>
                      <Person />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography variant="body1" fontWeight="medium">
                        {listingDetails[conversation.listingId]?.title ||
                          "Unknown Listing"}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {formatLastMessagePreview(conversation)}
                      </Typography>
                    }
                  />
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        {conversation.lastMessageAt && (
                          <Typography variant="caption" color="text.secondary">
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
                <Stack spacing={2}>
                  {pendingRequests.map((request) => (
                    <Card key={request.id} sx={{ bgcolor: "primary.50" }}>
                      <CardContent>
                        <Box>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Typography variant="h6" gutterBottom>
                              {listingDetails[request.listingId]?.title ||
                                "Loading listing..."}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mb: 2, display: "block" }}
                            >
                              From:{" "}
                              {userDetails[request.buyerId]?.firstName &&
                              userDetails[request.buyerId]?.lastName
                                ? `${userDetails[request.buyerId].firstName} ${
                                    userDetails[request.buyerId].lastName
                                  }`
                                : "Loading user..."}{" "}
                              • {formatTime(request.createdAt)}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 2 }}
                          >
                            {request.initialMessage}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="contained"
                            color="success"
                            startIcon={<Check />}
                            onClick={() => handleApproveRequest(request)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<Close />}
                            onClick={() => handleRejectRequest(request)}
                          >
                            Decline
                          </Button>
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
                sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}
              >
                <Typography variant="h6">
                  {listingDetails[selectedConversation.listingId]?.title ||
                    "Unknown Listing"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedConversation.userRole === "seller"
                    ? "Buyer inquiry"
                    : "Your inquiry"}
                  {selectedConversation.status !== "approved" && (
                    <Chip
                      label={`Status: ${selectedConversation.status}`}
                      size="small"
                      sx={{ ml: 1 }}
                      color={
                        selectedConversation.status === "pending"
                          ? "warning"
                          : "error"
                      }
                    />
                  )}
                </Typography>
              </Box>

              {/* Messages */}
              <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
                {selectedConversation.status !== "approved" && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    {selectedConversation.status === "pending"
                      ? selectedConversation.userRole === "seller"
                        ? "This buyer wants to message you about your listing. Approve to start chatting."
                        : "Your message request is pending approval from the seller."
                      : "This conversation request was declined."}
                  </Alert>
                )}

                {messages.map((message) => (
                  <Box
                    key={message.id}
                    sx={{
                      display: "flex",
                      justifyContent:
                        message.senderId === currentUser.uid
                          ? "flex-end"
                          : "flex-start",
                      mb: 1,
                    }}
                  >
                    <Paper
                      sx={{
                        p: 2,
                        maxWidth: "70%",
                        bgcolor:
                          message.senderId === currentUser.uid
                            ? "primary.main"
                            : "grey.100",
                        color:
                          message.senderId === currentUser.uid
                            ? "white"
                            : "text.primary",
                      }}
                    >
                      <Typography variant="body1">{message.text}</Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color:
                            message.senderId === currentUser.uid
                              ? "rgba(255,255,255,0.7)"
                              : "text.secondary",
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          mt: 0.5,
                        }}
                      >
                        <AccessTime fontSize="inherit" />
                        {formatTime(message.createdAt)}
                      </Typography>
                    </Paper>
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </Box>

              {/* Message Input */}
              {selectedConversation.status === "approved" && (
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
