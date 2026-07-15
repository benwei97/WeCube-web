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
import { useAuth } from "../contexts/useAuth";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";
import { clampText, INPUT_LIMITS } from "../utils/inputLimits";

export function AuthModal({ open, onClose, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  const isLogin = mode === "login";

  const getAuthErrorMessage = (authError, attemptedLogin) => {
    const code = authError?.code || "";

    if (attemptedLogin) {
      if (
        [
          "auth/invalid-credential",
          "auth/user-not-found",
          "auth/wrong-password",
          "auth/invalid-email",
        ].includes(code)
      ) {
        return "Invalid login credentials. Please check your email and password.";
      }

      if (code === "auth/too-many-requests") {
        return "Too many login attempts. Please wait a moment and try again.";
      }

      if (code === "auth/email-not-verified") {
        return "Please verify your email before logging in. We sent a new verification email in case the previous link expired.";
      }

      return "Unable to log in right now. Please try again.";
    }

    if (code === "auth/email-already-in-use") {
      return "An account with this email already exists. Please log in instead.";
    }

    if (code === "auth/weak-password") {
      return "Please choose a stronger password.";
    }

    if (code === "auth/invalid-email") {
      return "Please enter a valid email address.";
    }

    return "Unable to create your account right now. Please try again.";
  };

  // Reset form when modal opens/closes or mode changes
  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError("");
    setSuccess("");
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const switchMode = () => {
    setMode(isLogin ? "signup" : "login");
    setError("");
    setSuccess("");
  };

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!isLogin && (!trimmedFirstName || !trimmedLastName)) {
      setError("Enter your first and last name.");
      setSuccess("");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setLoading(true);

      if (isLogin) {
        await login(email, password);
        handleClose();
      } else {
        await signup(
          email,
          password,
          trimmedFirstName,
          trimmedLastName
        );

        setMode("login");
        setPassword("");
        setSuccess(
          "Verification email sent. Click the link in your email, then log in. If the link expires, try logging in again and we will send a new one."
        );
      }
    } catch (error) {
      setError(getAuthErrorMessage(error, isLogin));
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
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}
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
                  onChange={(e) =>
                    setFirstName(
                      clampText(e.target.value, INPUT_LIMITS.USER_NAME)
                    )
                  }
                  required={!isLogin}
                  slotProps={{
                    htmlInput: {
                      maxLength: INPUT_LIMITS.USER_NAME,
                    },
                  }}
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
                  onChange={(e) =>
                    setLastName(
                      clampText(e.target.value, INPUT_LIMITS.USER_NAME)
                    )
                  }
                  required={!isLogin}
                  slotProps={{
                    htmlInput: {
                      maxLength: INPUT_LIMITS.USER_NAME,
                    },
                  }}
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
