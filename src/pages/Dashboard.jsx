import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  TrendingUp,
  Inventory,
  AttachMoney,
  ShoppingCart,
  Edit,
  Delete,
  MoreVert,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { deleteMultipleImages } from "../utils/s3";

function Dashboard() {
  const [stats, setStats] = useState({
    totalListings: 0,
    activeListings: 0,
    totalSales: 0,
    totalEarnings: 0,
  });
  const [userListings, setUserListings] = useState([]);
  const [pastSales, setPastSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    listing: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      fetchDashboardData();
    }
  }, [currentUser]);

  const fetchDashboardData = async () => {
    try {
      const listingsQuery = query(
        collection(db, "listings"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const listingsSnapshot = await getDocs(listingsQuery);
      const listings = listingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setUserListings(listings);
      console.log(listings);

      const totalListings = listings.length;
      const activeListings = listings.filter(
        (listing) => listing.status === "active"
      ).length;
      const soldListings = listings.filter(
        (listing) => listing.status === "sold"
      ).length;

      const soldListingsData = listings.filter(
        (listing) => listing.status === "sold"
      );
      const sales = soldListingsData.map((listing) => ({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        soldDate: listing.soldAt || listing.updatedAt || listing.createdAt,
        buyer: listing.buyerId || listing.soldTo || "Unknown",
      }));

      const totalSales = soldListings.length || 0;
      const totalEarnings = soldListingsData.reduce(
        (sum, listing) => sum + listing.price,
        0
      );

      setStats({
        totalListings,
        activeListings,
        totalSales,
        totalEarnings,
      });

      setPastSales(sales);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setLoading(false);
    }
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

  const handleDeleteClick = (listing) => {
    setDeleteDialog({ open: true, listing });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, listing: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.listing) return;

    setIsDeleting(true);
    try {
      const listing = deleteDialog.listing;

      // Step 1: Delete images from S3
      if (listing.photos && listing.photos.length > 0) {
        const s3Keys = listing.photos.map((photo) => photo.s3Key);
        await deleteMultipleImages(s3Keys);
      }

      // Step 2: Delete listing from Firestore
      await deleteDoc(doc(db, "listings", listing.id));

      // Step 3: Update local state
      setUserListings((prev) => prev.filter((l) => l.id !== listing.id));

      // Update stats
      setStats((prev) => ({
        ...prev,
        totalListings: prev.totalListings - 1,
        activeListings:
          listing.status === "active"
            ? prev.activeListings - 1
            : prev.activeListings,
        totalSales:
          listing.status === "sold" ? prev.totalSales - 1 : prev.totalSales,
      }));

      console.log("Listing deleted successfully:", listing.id);
      setDeleteDialog({ open: false, listing: null });
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert(`Failed to delete listing: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMenuOpen = (event, listing) => {
    setMenuAnchor(event.currentTarget);
    setSelectedListing(listing);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedListing(null);
  };

  const handleEditClick = () => {
    if (selectedListing) {
      navigate(`/listing/${selectedListing.id}`);
    }
    handleMenuClose();
  };

  const handleDeleteMenuClick = () => {
    if (selectedListing) {
      handleDeleteClick(selectedListing);
    }
    handleMenuClose();
  };

  if (loading) {
    return (
      <Box sx={{ width: "60vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage your listings and track your sales performance
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 4 }}>
        <Button
          variant="outlined"
          onClick={() => navigate(`/seller/${currentUser.uid}`)}
        >
          View My Seller Profile
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 3, mb: 4, flexWrap: "wrap" }}>
        <Card sx={{ flex: "1 1 200px", minWidth: 200 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 1,
                p: 2,
              }}
            >
              <Inventory sx={{ fontSize: 24 }} />
              <Typography variant="h5" fontWeight="bold">
                {stats.totalListings}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Listings
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: "1 1 200px", minWidth: 200 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 1,
                p: 2,
              }}
            >
              <TrendingUp sx={{ fontSize: 24 }} />
              <Typography variant="h5" fontWeight="bold">
                {stats.activeListings}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active Listings
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: "1 1 200px", minWidth: 200 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 1,
                p: 2,
              }}
            >
              <ShoppingCart sx={{ fontSize: 24 }} />
              <Typography variant="h5" fontWeight="bold">
                {stats.totalSales}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Sales
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: "1 1 200px", minWidth: 200 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 1,
                p: 2,
              }}
            >
              <AttachMoney sx={{ fontSize: 24 }} />
              <Typography variant="h5" fontWeight="bold">
                {formatPrice(stats.totalEarnings)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Earnings
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <Box sx={{ flex: "2 1 400px", minWidth: 400 }}>
          <Paper sx={{ p: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography variant="h5" fontWeight="bold">
                My Listings
              </Typography>
              <Button variant="outlined" href="/sell">
                Create New Listing
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 300 }}>Item</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Condition</TableCell>
                    <TableCell>Date Listed</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ minHeight: 200 }}>
                  {userListings.map((listing) => (
                    <TableRow key={listing.id}>
                      <TableCell>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Typography
                            variant="body2"
                            title={listing.title}
                            sx={{
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              textDecoration: "none",
                              "&:hover": {
                                color: "primary.main",
                              },
                            }}
                            onClick={() => navigate(`/listing/${listing.id}`)}
                          >
                            {listing.title}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{formatPrice(listing.price)}</TableCell>
                      <TableCell>
                        <Chip
                          label={listing.condition}
                          color={getConditionColor(listing.condition)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(listing.createdAt)}</TableCell>
                      <TableCell>
                        <Chip
                          label={listing.status === "sold" ? "Sold" : "Active"}
                          color={
                            listing.status === "sold" ? "default" : "success"
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={(e) => handleMenuOpen(e, listing)}
                          size="small"
                        >
                          <MoreVert />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {userListings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No listings yet. Create your first listing!
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>

        {/* Past Sales Section */}
        <Box sx={{ flex: "1 1 300px", minWidth: 300 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
              Recent Sales
            </Typography>

            <Stack spacing={2}>
              {pastSales.map((sale, index) => (
                <Box key={sale.id}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight="medium">
                        {sale.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Sold to {sale.buyer}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(sale.soldDate)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h6"
                      color="success.main"
                      fontWeight="bold"
                      sx={{ flexShrink: 0 }}
                    >
                      {formatPrice(sale.price)}
                    </Typography>
                  </Box>
                  {index < pastSales.length - 1 && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
              {pastSales.length === 0 && (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No sales yet. Start selling to see your transaction history!
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Box>
      </Box>

      {/* Actions Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={handleEditClick}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeleteMenuClick}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Listing</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete "{deleteDialog.listing?.title}"?
            This action cannot be undone and will permanently remove the listing
            and all associated images.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={<Delete />}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard;
