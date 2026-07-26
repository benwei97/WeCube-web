import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Box,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Badge,
} from "@mui/material";
import { useAuth } from "../contexts/useAuth";
import { AuthModal } from "./AuthModal";
import {
  countUnreadConversations,
  getUserConversations,
  subscribeToUserConversations,
} from "../utils/messaging";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import logo from "../assets/wecube-logo.png";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

function Header() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [anchorEl, setAnchorEl] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadConversationCount, setUnreadConversationCount] = useState(0);
  const [openReportCount, setOpenReportCount] = useState(0);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isMenuOpen = Boolean(anchorEl);
  const activeConversationId = location.pathname.startsWith("/messages/")
    ? location.pathname.split("/")[2] || null
    : null;
  const primaryNavItems = [
    { label: "Browse", path: "/" },
    { label: "Competitions", path: "/competitions" },
    { label: "Sell", path: "/sell" },
  ];
  const desktopNavItems = [
    ...primaryNavItems,
    { label: "About", path: "/about" },
    { label: "Policies", path: "/safety" },
  ];
  const mobileNavItems = primaryNavItems;

  useEffect(() => {
    if (currentUser) {
      const getVisibleUnreadCount = (conversations, userId) => {
        const filteredConversations = activeConversationId
          ? conversations.filter(
              (conversation) => conversation.id !== activeConversationId
            )
          : conversations;

        return countUnreadConversations(filteredConversations, userId);
      };

      const loadMessageNotificationCount = async () => {
        try {
          const conversations = await getUserConversations(currentUser.uid);

          setUnreadConversationCount(
            getVisibleUnreadCount(conversations, currentUser.uid)
          );
        } catch (error) {
          console.error("Error loading message notifications:", error);
        }
      };

      loadMessageNotificationCount();

      const unsubscribeConversations = subscribeToUserConversations(
        currentUser.uid,
        (conversations) => {
          setUnreadConversationCount(
            getVisibleUnreadCount(conversations, currentUser.uid)
          );
        }
      );

      return () => {
        unsubscribeConversations();
      };
    } else {
      setUnreadConversationCount(0);
    }
  }, [currentUser, activeConversationId]);

  useEffect(() => {
    if (!currentUser?.isAdmin) {
      setOpenReportCount(0);
      return undefined;
    }

    const reportCollections = [
      "listingReports",
      "userReports",
      "conversationReports",
    ];
    const countsByCollection = Object.fromEntries(
      reportCollections.map((collectionName) => [collectionName, 0])
    );
    const updateOpenReportCount = () => {
      setOpenReportCount(
        Object.values(countsByCollection).reduce((sum, count) => sum + count, 0)
      );
    };

    const unsubscribers = reportCollections.map((collectionName) =>
      onSnapshot(
        query(
          collection(db, collectionName),
          where("status", "==", "open")
        ),
        (snapshot) => {
          countsByCollection[collectionName] = snapshot.size;
          updateOpenReportCount();
        },
        (error) => {
          console.error(`Error loading ${collectionName} count:`, error);
          countsByCollection[collectionName] = 0;
          updateOpenReportCount();
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser?.isAdmin]);

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

  const handleMessagesClick = (event) => {
    if (!currentUser) {
      event.preventDefault();
      openAuth("login");
    }
  };

  return (
    <>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          bgcolor: "#ffffff",
          borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
          boxShadow: "0 1px 10px rgba(31, 53, 99, 0.06)",
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 10 }, minHeight: { xs: 56, sm: 64 } }}>
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
            {desktopNavItems.map((item) => (
              <Button key={item.path} component={Link} to={item.path} color="inherit">
                {item.label}
              </Button>
            ))}
          </Box>

          <Box sx={{ display: { xs: "none", md: "block" }, flexGrow: 1 }} />

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              color="inherit"
              component={Link}
              to="/messages"
              onClick={handleMessagesClick}
              aria-label="Messages"
              sx={{ position: "relative" }}
            >
              <Badge
                badgeContent={unreadConversationCount}
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
              aria-label="Account"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                borderRadius: 2,
                px: 1,
              }}
            >
              <Badge
                badgeContent={openReportCount}
                color="error"
                overlap="circular"
                sx={{
                  "& .MuiBadge-badge": {
                    right: currentUser?.avatarUrl ? 1 : 0,
                    top: currentUser?.avatarUrl ? 2 : 3,
                  },
                }}
              >
                {currentUser?.avatarUrl ? (
                  <Avatar
                    src={currentUser.avatarUrl}
                    sx={{ width: 28, height: 28 }}
                  >
                    {currentUser?.firstName?.charAt(0)?.toUpperCase()}
                  </Avatar>
                ) : (
                  <PersonOutlineIcon />
                )}
              </Badge>
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
              <MenuItem onClick={() => handleMenuNavigation("/about")}>
                About
              </MenuItem>
              <MenuItem onClick={() => handleMenuNavigation("/safety")}>
                Policies
              </MenuItem>
              {currentUser?.isAdmin && (
                <MenuItem onClick={() => handleMenuNavigation("/admin/reports")}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                      width: "100%",
                    }}
                  >
                    <Box component="span">Admin Reports</Box>
                    <Badge
                      badgeContent={openReportCount}
                      color="error"
                      sx={{
                        "& .MuiBadge-badge": {
                          position: "static",
                          transform: "none",
                        },
                      }}
                    />
                  </Box>
                </MenuItem>
              )}
              <MenuItem onClick={handleLogoutClick} sx={{ color: "error.main" }}>
                Sign Out
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>

        <Box
          component="nav"
          aria-label="Primary navigation"
          sx={{
            display: { xs: "grid", md: "none" },
            gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))`,
            borderTop: "1px solid rgba(148, 163, 184, 0.14)",
            px: 1,
            pb: 0.5,
          }}
        >
          {mobileNavItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);

            return (
              <Button
                key={item.path}
                component={Link}
                to={item.path}
                color="inherit"
                size="small"
                sx={{
                  minWidth: 0,
                  px: 0.5,
                  py: 0.75,
                  borderRadius: 1,
                  fontSize: "0.78rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "primary.main" : "text.secondary",
                  textTransform: "none",
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Box>
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
