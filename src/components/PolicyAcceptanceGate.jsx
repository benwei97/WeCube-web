import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import {
  REQUIRED_POLICY_VERSION,
  hasAcceptedCurrentPolicies,
} from "../constants/policies";

export default function PolicyAcceptanceGate() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isPolicyRoute = ["/safety", "/terms", "/privacy"].includes(
    location.pathname
  );
  const shouldShow =
    currentUser && !hasAcceptedCurrentPolicies(currentUser) && !isPolicyRoute;

  const handleAccept = async () => {
    if (!currentUser?.uid || !accepted) return;

    setSaving(true);
    setError("");

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        acceptedPoliciesAt: new Date(),
        acceptedPolicyVersion: REQUIRED_POLICY_VERSION,
        acceptedTermsVersion: REQUIRED_POLICY_VERSION,
        acceptedPrivacyVersion: REQUIRED_POLICY_VERSION,
      });
    } catch (acceptError) {
      console.error("Error accepting policies:", acceptError);
      setError("Unable to save your acceptance right now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <Dialog open maxWidth="sm" fullWidth>
      <DialogTitle>Review WeCube Policies</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <DialogContentText>
            To continue using WeCube, review and agree to the current policies.
          </DialogContentText>
          <FormControlLabel
            control={
              <Checkbox
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={saving}
              />
            }
            label={
              <Typography variant="body2">
                I agree to the{" "}
                <Box component={Link} to="/terms" sx={{ color: "primary.main" }}>
                  Terms & Conditions
                </Box>
                ,{" "}
                <Box component={Link} to="/privacy" sx={{ color: "primary.main" }}>
                  Privacy Policy
                </Box>
                , and{" "}
                <Box component={Link} to="/safety" sx={{ color: "primary.main" }}>
                  Safety Guidelines
                </Box>
                .
              </Typography>
            }
          />
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={logout} color="inherit" disabled={saving}>
          Sign Out
        </Button>
        <Button
          onClick={handleAccept}
          variant="contained"
          disabled={!accepted || saving}
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
