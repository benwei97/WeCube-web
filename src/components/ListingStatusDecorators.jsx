import { Box, CardMedia, Typography } from "@mui/material";
import { getSoldMediaSx, getSoldPlaceholderSx } from "./listingStatusStyles";

export function SoldRibbon({ size = "default" }) {
  const isLarge = size === "large";

  return (
    <Box
      sx={{
        position: "absolute",
        top: isLarge ? 18 : 12,
        left: isLarge ? 18 : 12,
        px: isLarge ? 1.8 : 1.1,
        py: isLarge ? 0.85 : 0.45,
        borderRadius: 999,
        textAlign: "center",
        backgroundColor: "rgba(35, 35, 35, 0.92)",
        color: "common.white",
        fontSize: isLarge ? "0.98rem" : "0.72rem",
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        boxShadow: 2,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      Sold
    </Box>
  );
}

export function PendingBadge({ size = "default" }) {
  const isLarge = size === "large";

  return (
    <Box
      sx={{
        position: "absolute",
        top: isLarge ? 18 : 12,
        left: isLarge ? 18 : 12,
        px: isLarge ? 1.8 : 1.1,
        py: isLarge ? 0.85 : 0.45,
        borderRadius: 999,
        backgroundColor: "error.main",
        color: "error.contrastText",
        fontSize: isLarge ? "0.98rem" : "0.72rem",
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        boxShadow: 2,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      Pending
    </Box>
  );
}

export function ListingCardMediaFrame({
  imageUrl,
  alt,
  isSold = false,
  isPending = false,
  imageSx = {},
  placeholderSx = {},
  placeholderLabel = "No Image",
}) {
  const resolvedImageSx = isSold ? getSoldMediaSx(imageSx) : imageSx;
  const resolvedPlaceholderSx = isSold
    ? getSoldPlaceholderSx(placeholderSx)
    : placeholderSx;

  return (
    <Box
      className="listing-card-media-frame"
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "common.white",
      }}
    >
      {isSold && <SoldRibbon />}
      {isPending && !isSold && <PendingBadge />}
      {imageUrl ? (
        <CardMedia
          className="listing-card-media-image"
          component="img"
          image={imageUrl}
          alt={alt}
          sx={{
            width: "100%",
            height: "100%",
            ...resolvedImageSx,
          }}
        />
      ) : (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            ...resolvedPlaceholderSx,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {placeholderLabel}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
