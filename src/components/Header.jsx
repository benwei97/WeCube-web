import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Box,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Badge,
} from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import { AuthModal } from "./AuthModal";
import {
  countUnreadConversations,
  getPendingRequests,
  getUserConversations,
  subscribeToPendingRequests,
  subscribeToUserConversations,
} from "../utils/messaging";
import { subscribeToPendingReviewCount } from "../utils/reviews";
import logo from "../assets/wecube-logo.png";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

function Header() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [anchorEl, setAnchorEl] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadConversationCount, setUnreadConversationCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const isMenuOpen = Boolean(anchorEl);

  useEffect(() => {
    if (currentUser) {
      loadMessageNotificationCount();

      const unsubscribeConversations = subscribeToUserConversations(
        currentUser.uid,
        (conversations) => {
          setUnreadConversationCount(
            countUnreadConversations(conversations, currentUser.uid)
          );
        }
      );

      const unsubscribePending = subscribeToPendingRequests(
        currentUser.uid,
        (pendingRequests) => {
          setPendingRequestCount(pendingRequests.length);
        }
      );

      const unsubscribePendingReviews = subscribeToPendingReviewCount(
        currentUser.uid,
        setPendingReviewCount,
        (error) => {
          console.error("Error subscribing to pending reviews:", error);
        }
      );

      return () => {
        unsubscribeConversations();
        unsubscribePending();
        unsubscribePendingReviews();
      };
    } else {
      setUnreadConversationCount(0);
      setPendingRequestCount(0);
      setPendingReviewCount(0);
    }
  }, [currentUser]);

  const loadMessageNotificationCount = async () => {
    try {
      const [pendingRequests, conversations] = await Promise.all([
        getPendingRequests(currentUser.uid),
        getUserConversations(currentUser.uid),
      ]);

      setPendingRequestCount(pendingRequests.length);
      setUnreadConversationCount(
        countUnreadConversations(conversations, currentUser.uid)
      );
    } catch (error) {
      console.error("Error loading message notifications:", error);
    }
  };

  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  const closeModals = () => {
    setShowAuth(false);
    setShowLogoutConfirm(false);
  };

  const handleMenuOpen = (event) => {
    if (currentUser) {
      setAnchorEl(event.currentTarget);
    } else {
      openAuth("login");
    }
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogoutClick = () => {
    setAnchorEl(null);
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await logout();
      setShowLogoutConfirm(false);
      navigate("/");
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const handleMenuNavigation = (path) => {
    setAnchorEl(null);
    navigate(path);
  };
  return (
    <>
      <AppBar position="fixed" color="inherit" elevation={1}>
        <Toolbar sx={{ px: { xs: 2, md: 10 } }}>
          <Box
            component={Link}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <img
              src={logo}
              alt="WeCube Logo"
              style={{ height: 40, marginRight: 12 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              WeCube
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 3, mr: 3 }}>
            <Button component={Link} to="/" color="inherit">
              Browse
            </Button>
            <Button component={Link} to="/competitions" color="inherit">
              Competitions
            </Button>
            <Button component={Link} to="/sell" color="inherit">
              Sell
            </Button>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              color="inherit"
              component={Link}
              to="/messages"
              sx={{ position: "relative" }}
            >
              <Badge
                badgeContent={pendingRequestCount + unreadConversationCount}
                color="error"
                overlap="circular"
                sx={{
                  "& .MuiBadge-badge": {
                    right: 3,
                    top: 3,
                  },
                }}
              >
                <ChatBubbleOutlineIcon fontSize="small" />
              </Badge>
            </IconButton>

            <IconButton
              color="inherit"
              onClick={handleMenuOpen}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                borderRadius: 2,
                px: 1,
              }}
            >
              <PersonOutlineIcon />
              {currentUser && (
                <Typography
                  variant="body2"
                  sx={{ display: { xs: "none", sm: "block" } }}
                >
                  {currentUser.firstName}
                </Typography>
              )}
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={isMenuOpen}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              slotProps={{
                paper: {
                  sx: { mt: 1, minWidth: 180 },
                },
              }}
            >
              <MenuItem onClick={() => handleMenuNavigation("/dashboard")}>
                Dashboard
              </MenuItem>
              <MenuItem onClick={() => handleMenuNavigation("/my-listings")}>
                My Listings
              </MenuItem>
              <MenuItem onClick={() => handleMenuNavigation("/my-purchases")}>
                My Purchases
              </MenuItem>
              <MenuItem onClick={() => handleMenuNavigation("/my-reviews")}>
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 2 }}>
                  <span>My Reviews</span>
                  {pendingReviewCount > 0 && (
                    <Badge badgeContent={pendingReviewCount} color="error" />
                  )}
                </Box>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => handleMenuNavigation("/settings")}>
                Settings
              </MenuItem>
              <MenuItem onClick={handleLogoutClick}>Sign Out</MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <AuthModal open={showAuth} onClose={closeModals} initialMode={authMode} />

      <Dialog
        open={showLogoutConfirm}
        onClose={closeModals}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Sign Out</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to sign out?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModals} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleLogoutConfirm}
            color="error"
            variant="contained"
          >
            Sign Out
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default Header;
