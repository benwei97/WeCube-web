import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Star } from "@mui/icons-material";
import { useState } from "react";
import { submitTransactionReview } from "../utils/reviews";
import { getS3PublicUrl } from "../utils/s3";

function getListingThumbnailUrl(listing) {
  const photo = listing?.photos?.[0];
  return photo?.s3Key ? getS3PublicUrl(photo.s3Key) : null;
}

function PostSaleReviewPrompt({
  open,
  onClose,
  listing,
  reviewer,
  recipientId,
  recipientName,
  recipientAvatarUrl,
  recipientRole,
  title,
  subtitle,
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const thumbnailUrl = getListingThumbnailUrl(listing);

  const handleSubmit = async () => {
    if (!listing || !reviewer || !recipientId) return;

    setSubmitting(true);
    try {
      await submitTransactionReview({
        listing,
        reviewer,
        rating,
        comment,
        recipientId,
        recipientName,
        recipientRole,
      });
      setComment("");
      setRating(5);
      onClose();
    } catch (error) {
      console.error("Error submitting post-sale review:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      transitionDuration={{ enter: 520, exit: 220 }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack
          spacing={2}
          sx={{
            mt: 1,
            animation: "postSaleReviewPop 720ms cubic-bezier(0.16, 1, 0.3, 1)",
            "@keyframes postSaleReviewPop": {
              "0%": { transform: "translateY(18px) scale(0.98)", opacity: 0 },
              "55%": { transform: "translateY(-2px) scale(1.005)", opacity: 1 },
              "100%": { transform: "translateY(0) scale(1)", opacity: 1 },
            },
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: 1.5,
                overflow: "hidden",
                bgcolor: "grey.100",
                flexShrink: 0,
              }}
            >
              {thumbnailUrl ? (
                <Box
                  component="img"
                  src={thumbnailUrl}
                  alt={listing?.title || "Puzzle"}
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    No Image
                  </Typography>
                </Box>
              )}
            </Box>
            <Avatar src={recipientAvatarUrl || undefined} sx={{ width: 48, height: 48 }}>
              {recipientName?.charAt(0)?.toUpperCase() || "U"}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" fontWeight={700}>
                {recipientName || "User"}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {listing?.title || "Completed transaction"}
              </Typography>
            </Box>
          </Stack>

          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Rating
            </Typography>
            <Stack direction="row" spacing={0.5} aria-label={`${rating} star rating`}>
              {[1, 2, 3, 4, 5].map((value) => (
                <IconButton
                  key={value}
                  aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                  onClick={() => setRating(value)}
                  size="small"
                  sx={{ color: value <= rating ? "primary.main" : "action.disabled" }}
                >
                  <Star />
                </IconButton>
              ))}
            </Stack>
          </Box>

          <TextField
            label="Quick review"
            multiline
            minRows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Share how the transaction went."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disabled={submitting}>
          Maybe Later
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          Save Review
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PostSaleReviewPrompt;
