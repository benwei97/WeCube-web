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
import { getPendingRequests } from "../utils/messaging";
import logo from "../assets/wecube-logo.png";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

function Header() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [anchorEl, setAnchorEl] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const isMenuOpen = Boolean(anchorEl);

  // Load pending message requests count
  useEffect(() => {
    if (currentUser) {
      loadPendingCount();
      // Set up periodic refresh every 30 seconds
      const interval = setInterval(loadPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const loadPendingCount = async () => {
    try {
      const pending = await getPendingRequests(currentUser.uid);
      setPendingCount(pending.length);
    } catch (error) {
      console.error("Error loading pending requests:", error);
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
                badgeContent={pendingCount}
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
