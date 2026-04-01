import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Paper,
  ImageList,
  ImageListItem,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormGroup,
  FormHelperText,
} from "@mui/material";
import {
  Edit,
  LocationOn,
  LocalShipping,
  Groups,
  Close,
  Save,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { createConversationRequest, getExistingConversation } from "../utils/messaging";
import PaymentModal from "../components/PaymentModal";

function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [existingConversation, setExistingConversation] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    deliveryOptions: {
      shipping: false,
      meetup: false,
    },
  });

  useEffect(() => {
    fetchListing();
  }, [id]);

  useEffect(() => {
    // Check for existing conversation when user and listing are loaded
    if (currentUser && listing && currentUser.uid !== listing.userId) {
      checkExistingConversation();
    }
  }, [currentUser, listing]);

  const checkExistingConversation = async () => {
    try {
      const conversation = await getExistingConversation(id, currentUser.uid);
      setExistingConversation(conversation);
    } catch (error) {
      console.error("Error checking existing conversation:", error);
    }
  };

  const fetchListing = async () => {
    try {
      const docRef = doc(db, "listings", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const listingData = { id: docSnap.id, ...docSnap.data() };

        // Fetch seller's Stripe account ID
        const sellerDoc = await getDoc(doc(db, "users", listingData.userId));
        const sellerData = sellerDoc.data();

        setListing({
          ...listingData,
          stripeAccountId: sellerData?.stripeAccountId,
          sellerName: `${sellerData?.firstName || ''} ${sellerData?.lastName || ''}`.trim() || 'Seller'
        });

        setEditData({
          title: listingData.title,
          price: listingData.price.toString(),
          description: listingData.description || "",
          condition: listingData.condition,
          deliveryOptions: listingData.deliveryOptions || {
            shipping: false,
            meetup: false,
          },
        });
      } else {
        console.log("No such document!");
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Error fetching listing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    setEditMode(!editMode);
  };

  const handleInputChange = (field) => (event) => {
    setEditData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setEditData((prev) => ({
        ...prev,
        price: value,
      }));
    }
  };

  const handleDeliveryChange = (option) => (event) => {
    setEditData((prev) => ({
      ...prev,
      deliveryOptions: {
        ...prev.deliveryOptions,
        [option]: event.target.checked,
      },
    }));
  };

  const handleSave = async () => {
    try {
      const isDeliveryValid =
        editData.deliveryOptions.shipping || editData.deliveryOptions.meetup;

      if (
        !editData.title ||
        !editData.price ||
        !editData.condition ||
        !isDeliveryValid
      ) {
        alert("Please fill in all required fields");
        return;
      }

      const docRef = doc(db, "listings", id);
      await updateDoc(docRef, {
        title: editData.title,
        price: parseFloat(editData.price),
        description: editData.description,
        condition: editData.condition,
        deliveryOptions: editData.deliveryOptions,
        updatedAt: new Date(),
      });

      setListing((prev) => ({
        ...prev,
        title: editData.title,
        price: parseFloat(editData.price),
        description: editData.description,
        condition: editData.condition,
        deliveryOptions: editData.deliveryOptions,
        updatedAt: new Date(),
      }));

      setEditMode(false);
      alert("Listing updated successfully!");
    } catch (error) {
      console.error("Error updating listing:", error);
      alert("Failed to update listing");
    }
  };

  const handleMessageRequest = async () => {
    if (!currentUser) {
      alert("Please sign in to message the seller");
      return;
    }

    if (currentUser.uid === listing.userId) {
      alert("You cannot message yourself");
      return;
    }

    if (!messageText.trim()) {
      alert("Please enter a message");
      return;
    }

    setSendingMessage(true);
    try {
      await createConversationRequest(
        id,
        listing.userId,
        currentUser.uid,
        messageText.trim()
      );

      setShowMessageDialog(false);
      setMessageText("");

      // Refresh conversation status
      await checkExistingConversation();

      alert("Message request sent! The seller will need to approve before you can chat.");
    } catch (error) {
      console.error("Error sending message request:", error);
      alert(error.message || "Failed to send message request");
    } finally {
      setSendingMessage(false);
    }
  };

  const openMessageDialog = () => {
    if (!currentUser) {
      alert("Please sign in to message the seller");
      return;
    }
    setShowMessageDialog(true);
  };

  const handlePurchaseClick = () => {
    if (!currentUser) {
      alert("Please sign in to make a purchase");
      return;
    }

    if (currentUser.uid === listing.userId) {
      alert("You cannot purchase your own listing");
      return;
    }

    if (listing.status === "sold") {
      alert("This item has already been sold");
      return;
    }

    if (!listing.stripeAccountId) {
      alert("This seller has not completed their payment setup. The item cannot be purchased at this time.");
      return;
    }

    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async (paymentResult, paymentIntent) => {
    try {
      // Update listing status to sold
      const docRef = doc(db, "listings", id);
      await updateDoc(docRef, {
        status: "sold",
        soldAt: new Date(),
        buyerId: currentUser.uid,
        paymentIntentId: paymentIntent.id,
      });

      // Update local state
      setListing((prev) => ({
        ...prev,
        status: "sold",
        soldAt: new Date(),
        buyerId: currentUser.uid,
      }));

      setShowPaymentModal(false);

      // Optional: Navigate to a success page or show success message
      alert("Purchase completed successfully! You will receive confirmation details shortly.");

    } catch (error) {
      console.error("Error updating listing after payment:", error);
      alert("Payment successful, but there was an issue updating the listing. Please contact support.");
    }
  };

  const getMessageButtonText = () => {
    if (!existingConversation) return "Message Owner";

    switch (existingConversation.status) {
      case "pending":
        return "Request Pending";
      case "approved":
        return "Continue Chat";
      case "rejected":
        return "Request Declined";
      default:
        return "Message Owner";
    }
  };

  const isMessageButtonDisabled = () => {
    return existingConversation?.status === "pending" || existingConversation?.status === "rejected";
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  const formatDate = (date) => {
    if (!date) return "N/A";
    const dateObj = date.toDate ? date.toDate() : new Date(date);
    return dateObj.toLocaleDateString();
  };

  const getConditionColor = (condition) => {
    const colors = {
      new: "success",
      "like-new": "success",
      excellent: "info",
      good: "warning",
      fair: "warning",
      used: "default",
    };
    return colors[condition] || "default";
  };

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  if (!listing) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Listing not found</Typography>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          Back
        </Button>
      </Box>
    );
  }

  const isOwner = currentUser && currentUser.uid === listing.userId;

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Button onClick={() => navigate(-1)} variant="outlined">
          ← Back
        </Button>
        {isOwner ? (
          <Button
            variant="contained"
            startIcon={<Edit />}
            onClick={handleEditToggle}
          >
            Edit Listing
          </Button>
        ) : (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              color="info"
              onClick={
                existingConversation?.status === "approved"
                  ? () => navigate(`/messages/${existingConversation.id}`)
                  : openMessageDialog
              }
              disabled={isMessageButtonDisabled()}
            >
              {getMessageButtonText()}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={handlePurchaseClick}
              disabled={listing.status === "sold"}
            >
              {listing.status === "sold" ? "Sold" : "Purchase"}
            </Button>
          </Box>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Images Section */}
        <Grid>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Photos
            </Typography>
            {listing.photos && listing.photos.length > 0 ? (
              <ImageList variant="masonry" cols={2} gap={8}>
                {listing.photos.map((photo, index) => (
                  <ImageListItem key={index}>
                    <img
                      src={`https://wecube.s3.us-east-1.amazonaws.com/${photo.s3Key}`}
                      alt={`Listing photo ${index + 1}`}
                      loading="lazy"
                      style={{
                        borderRadius: 8,
                        width: "100%",
                        height: "auto",
                      }}
                      onError={(e) => {
                        console.error("Failed to load image:", photo.s3Key);
                        e.target.style.display = "none";
                      }}
                    />
                  </ImageListItem>
                ))}
              </ImageList>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No photos available
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Details Section */}
        <Grid>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
              {listing.title}
            </Typography>

            <Typography
              variant="h3"
              color="primary"
              fontWeight="bold"
              sx={{ mb: 2 }}
            >
              {formatPrice(listing.price)}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip
                label={listing.condition}
                color={getConditionColor(listing.condition)}
              />
              <Chip
                label={listing.status === "sold" ? "Sold" : "Available"}
                color={listing.status === "sold" ? "default" : "success"}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>
              Description
            </Typography>
            <Typography variant="body1">
              {listing.description || "No description provided."}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>
              Delivery Options
            </Typography>
            <Stack direction="row" spacing={2}>
              {listing.deliveryOptions?.shipping && (
                <Chip
                  sx={{ px: 1 }}
                  icon={<LocalShipping />}
                  label="Shipping Available"
                  variant="outlined"
                />
              )}
              {listing.deliveryOptions?.meetup && (
                <Chip
                  sx={{ px: 1 }}
                  icon={<Groups />}
                  label="Competition Meetup"
                  variant="outlined"
                />
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2" color="text.secondary">
              Listed on {formatDate(listing.createdAt)}
              {listing.updatedAt && (
                <> • Updated on {formatDate(listing.updatedAt)}</>
              )}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Edit Dialog */}
      <Dialog
        open={editMode}
        onClose={handleEditToggle}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Edit Listing
            <Button onClick={handleEditToggle}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              value={editData.title}
              onChange={handleInputChange("title")}
              required
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Price (USD)"
                  fullWidth
                  value={editData.price}
                  onChange={handlePriceChange}
                  slotProps={{
                    htmlInput: {
                      inputMode: "decimal",
                    },
                  }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Condition</InputLabel>
                  <Select
                    value={editData.condition}
                    label="Condition"
                    onChange={handleInputChange("condition")}
                  >
                    <MenuItem value="new">New</MenuItem>
                    <MenuItem value="like-new">Like New</MenuItem>
                    <MenuItem value="excellent">Excellent</MenuItem>
                    <MenuItem value="good">Good</MenuItem>
                    <MenuItem value="fair">Fair</MenuItem>
                    <MenuItem value="used">Used</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={editData.description}
              onChange={handleInputChange("description")}
            />

            <FormControl required>
              <Typography variant="subtitle1" gutterBottom>
                Delivery Options
              </Typography>
              <FormGroup>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="body1">Shipping</Typography>
                  <Switch
                    checked={editData.deliveryOptions.shipping}
                    onChange={handleDeliveryChange("shipping")}
                  />
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography variant="body1">Competition Meetup</Typography>
                  <Switch
                    checked={editData.deliveryOptions.meetup}
                    onChange={handleDeliveryChange("meetup")}
                  />
                </Box>
              </FormGroup>
              {!editData.deliveryOptions.shipping &&
                !editData.deliveryOptions.meetup && (
                  <FormHelperText error>
                    Please select at least one delivery option
                  </FormHelperText>
                )}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditToggle}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" startIcon={<Save />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Message Request Dialog */}
      <Dialog
        open={showMessageDialog}
        onClose={() => setShowMessageDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Send Message Request
            <Button onClick={() => setShowMessageDialog(false)}>
              <Close />
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Send a message to inquire about this listing. The seller will need to approve your request before you can chat.
          </Typography>
          <TextField
            autoFocus
            label="Your message"
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Hi, I'm interested in this cube. Is it still available?"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMessageDialog(false)} disabled={sendingMessage}>
            Cancel
          </Button>
          <Button
            onClick={handleMessageRequest}
            variant="contained"
            disabled={sendingMessage || !messageText.trim()}
          >
            {sendingMessage ? "Sending..." : "Send Request"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Modal */}
      {currentUser && listing && (
        <PaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          listing={listing}
          buyerInfo={currentUser}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}

export default ListingDetail;
