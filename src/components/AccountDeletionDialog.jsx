import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { deleteUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import { closeListingConversationsForDeletedListing } from "../utils/messaging";
import { deleteImageFromS3, deleteMultipleImages } from "../utils/s3";

const ACCOUNT_DELETE_CONFIRMATION = "DELETE";
const ACCOUNT_DELETE_RECENT_LOGIN_WINDOW_MS = 5 * 60 * 1000;

export default function AccountDeletionDialog({ open, onClose }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    if (loading) return;
    setConfirmText("");
    setError("");
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (!currentUser?.uid) return;
    if (confirmText !== ACCOUNT_DELETE_CONFIRMATION) {
      setError("Type DELETE to confirm account deletion.");
      return;
    }

    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.uid !== currentUser.uid) {
      setError("Unable to confirm your signed-in session. Please sign in again.");
      return;
    }

    const lastSignInAt = Date.parse(firebaseUser.metadata?.lastSignInTime || "");
    const hasRecentLogin =
      Number.isFinite(lastSignInAt) &&
      Date.now() - lastSignInAt <= ACCOUNT_DELETE_RECENT_LOGIN_WINDOW_MS;

    if (!hasRecentLogin) {
      setError("For security, sign out and sign back in, then try deleting your account again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const userListingsSnapshot = await getDocs(
        query(collection(db, "listings"), where("userId", "==", currentUser.uid))
      );

      for (const listingDoc of userListingsSnapshot.docs) {
        const listing = { id: listingDoc.id, ...listingDoc.data() };
        const s3Keys = (listing.photos || [])
          .map((photo) => photo.s3Key)
          .filter(Boolean);

        if (s3Keys.length) {
          try {
            await deleteMultipleImages(s3Keys);
          } catch (cleanupError) {
            console.error("Error deleting listing images during account deletion:", cleanupError);
          }
        }

        try {
          await closeListingConversationsForDeletedListing(
            listing.id,
            listing.userId,
            listing.title || "this listing"
          );
        } catch (conversationError) {
          console.error("Error closing listing conversations during account deletion:", conversationError);
        }

        await deleteDoc(doc(db, "listings", listing.id));
      }

      if (currentUser.avatarS3Key) {
        try {
          await deleteImageFromS3(currentUser.avatarS3Key);
        } catch (cleanupError) {
          console.error("Error deleting avatar during account deletion:", cleanupError);
        }
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        email: "",
        firstName: "Deleted",
        lastName: "User",
        avatarUrl: "",
        avatarS3Key: "",
        attendingCompetitions: [],
        deletedAt: new Date(),
        deletedByUser: true,
      });

      await deleteUser(firebaseUser);
      setConfirmText("");
      setError("");
      onClose();
      navigate("/");
    } catch (deleteError) {
      console.error("Error deleting account:", deleteError);
      if (deleteError.code === "auth/requires-recent-login") {
        setError("For security, sign out and sign back in, then try deleting your account again.");
      } else {
        setError(deleteError.message || "Unable to delete your account right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete Account</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <DialogContentText>
            This permanently deletes your sign-in and removes your listings. Your public profile
            will be shown as Deleted User, and messages, reviews, and reports may be retained for
            safety, moderation, abuse prevention, and service integrity.
          </DialogContentText>
          <TextField
            label="Type DELETE to confirm"
            value={confirmText}
            onChange={(event) => {
              setConfirmText(event.target.value);
              setError("");
            }}
            disabled={loading}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleDeleteAccount}
          color="error"
          variant="contained"
          disabled={loading || confirmText !== ACCOUNT_DELETE_CONFIRMATION}
        >
          {loading ? "Deleting..." : "Delete Account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
