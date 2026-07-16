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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup, resetPassword } = useAuth();

  const isLogin = mode === "login";
  const isResetPassword = mode === "resetPassword";

  const getAuthErrorMessage = (authError, attemptedLogin) => {
    const code = authError?.code || "";

    if (isResetPassword) {
      if (code === "auth/invalid-email") {
        return "Please enter a valid email address.";
      }

      if (code === "auth/too-many-requests") {
        return "Too many attempts. Please wait a moment and try again.";
      }

      return "Unable to send a password reset email right now. Please try again.";
    }

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
        return "Too many attempts. Please wait a moment and try again.";
      }

      if (code === "auth/email-not-verified") {
        return "Please verify your email before logging in. We sent a new verification email in case the previous link expired. Check your spam or junk folder if you do not see it.";
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
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
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
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  };

  const switchToResetPassword = () => {
    setMode("resetPassword");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  };

  const switchToLogin = () => {
    setMode("login");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  };

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Enter your email address.");
      setSuccess("");
      return;
    }

    if (!isLogin && !isResetPassword && (!trimmedFirstName || !trimmedLastName)) {
      setError("Enter your first and last name.");
      setSuccess("");
      return;
    }

    if (!isLogin && !isResetPassword && password !== confirmPassword) {
      setError("Passwords do not match.");
      setSuccess("");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setLoading(true);

      if (isResetPassword) {
        await resetPassword(trimmedEmail);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setSuccess(
          "If an account exists for that email, a password reset link has been sent. Check your spam or junk folder if you do not see it."
        );
      } else if (isLogin) {
        await login(trimmedEmail, password);
        handleClose();
      } else {
        await signup(
          trimmedEmail,
          password,
          trimmedFirstName,
          trimmedLastName
        );

        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setSuccess(
          "Verification email sent. Click the link in your email, then log in. Check your spam or junk folder if you do not see it. If the link expires, try logging in again and we will send a new one."
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
          {isResetPassword ? "Reset Password" : isLogin ? "Log In" : "Sign Up"}
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
          <Collapse in={!isLogin && !isResetPassword} timeout={300}>
            <Grid container spacing={2} sx={{ mb: 1 }}>
              <Grid>
                <TextField
                  autoFocus={!isLogin && !isResetPassword}
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
                  required={!isLogin && !isResetPassword}
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
                  required={!isLogin && !isResetPassword}
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
            autoFocus={isLogin || isResetPassword}
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

          {!isResetPassword && (
            <>
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
              {isLogin && (
                <Box sx={{ textAlign: "right", mt: 0.5 }}>
                  <Button
                    variant="text"
                    size="small"
                    onClick={switchToResetPassword}
                    sx={{ textTransform: "none" }}
                  >
                    Forgot password?
                  </Button>
                </Box>
              )}
              {!isLogin && (
                <TextField
                  margin="normal"
                  label="Confirm Password"
                  type={showConfirmPassword ? "text" : "password"}
                  fullWidth
                  variant="outlined"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  error={Boolean(confirmPassword) && password !== confirmPassword}
                  helperText={
                    confirmPassword && password !== confirmPassword
                      ? "Passwords do not match."
                      : ""
                  }
                  slotProps={{
                    input: {
                      endAdornment: confirmPassword.length > 0 && (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            edge="end"
                          >
                            {showConfirmPassword ? (
                              <VisibilityOffIcon />
                            ) : (
                              <VisibilityIcon />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            </>
          )}
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
              ? isResetPassword
                ? "Sending Reset Email..."
                : isLogin
                ? "Logging in..."
                : "Creating Account..."
              : isResetPassword
              ? "Send Reset Email"
              : isLogin
              ? "Log In"
              : "Sign Up"}
          </Button>

          <Box sx={{ textAlign: "center" }}>
            {isResetPassword ? (
              <Button
                variant="text"
                size="small"
                onClick={switchToLogin}
                sx={{ textTransform: "none" }}
              >
                Back to Log In
              </Button>
            ) : (
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
            )}
          </Box>
        </DialogActions>
      </form>
    </Dialog>
  );
}
