import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  IconButton,
  InputAdornment,
  Alert,
  Grid,
  Collapse,
} from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";

export function AuthModal({ open, onClose, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  const isLogin = mode === "login";

  // Reset form when modal opens/closes or mode changes
  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const switchMode = () => {
    setMode(isLogin ? "signup" : "login");
    setError(""); // Clear any existing errors when switching
  };

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setError("");
      setLoading(true);

      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, firstName, lastName);
      }

      handleClose();
    } catch (error) {
      setError(
        `Failed to ${isLogin ? "log in" : "create account"}: ${error.message}`
      );
    }

    setLoading(false);
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            transition: "height 0.3s ease-in-out",
            overflow: "visible",
          },
        },
      }}
    >
      <DialogTitle sx={{ position: "relative" }}>
        <Typography variant="h5" component="div">
          {isLogin ? "Log In" : "Sign Up"}
        </Typography>
        <IconButton
          onClick={handleClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Name fields for signup with smooth collapse animation */}
          <Collapse in={!isLogin} timeout={300}>
            <Grid container spacing={2} sx={{ mb: 1 }}>
              <Grid>
                <TextField
                  autoFocus={!isLogin}
                  margin="normal"
                  label="First Name"
                  type="text"
                  fullWidth
                  variant="outlined"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required={!isLogin}
                  sx={{ mt: 0 }}
                />
              </Grid>
              <Grid>
                <TextField
                  margin="normal"
                  label="Last Name"
                  type="text"
                  fullWidth
                  variant="outlined"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required={!isLogin}
                  sx={{ mt: 0 }}
                />
              </Grid>
            </Grid>
          </Collapse>

          <TextField
            autoFocus={isLogin}
            margin="normal"
            label="Email"
            type="email"
            fullWidth
            variant="outlined"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            margin="normal"
            label="Password"
            type={showPassword ? "text" : "password"}
            fullWidth
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            slotProps={{
              input: {
                endAdornment: password.length > 0 && (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </DialogContent>

        <DialogActions
          sx={{ px: 3, pb: 3, pt: 2, flexDirection: "column", gap: 2 }}
        >
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
          >
            {loading
              ? isLogin
                ? "Logging in..."
                : "Creating Account..."
              : isLogin
              ? "Log In"
              : "Sign Up"}
          </Button>

          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {isLogin ? "Need an account?" : "Already have an account?"}{" "}
              <Button
                variant="text"
                size="small"
                onClick={switchMode}
                sx={{ textTransform: "none" }}
              >
                {isLogin ? "Sign Up" : "Log In"}
              </Button>
            </Typography>
          </Box>
        </DialogActions>
      </form>
    </Dialog>
  );
}
