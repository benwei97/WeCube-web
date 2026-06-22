import { Box, CardMedia, Typography } from "@mui/material";

export const LISTING_CARD_GRID_SX = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    md: "repeat(3, minmax(0, 1fr))",
    lg: "repeat(4, minmax(0, 1fr))",
  },
  gap: 3,
  alignItems: "stretch",
};

export const LISTING_CARD_SX = {
  display: "flex",
  flexDirection: "column",
  position: "relative",
  height: "100%",
};

export const LISTING_CARD_CONTENT_SX = {
  display: "flex",
  flexDirection: "column",
  gap: 1.5,
  flexGrow: 1,
};

export const LISTING_CARD_TITLE_SX = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  minHeight: "2.8rem",
  lineHeight: 1.2,
  mb: 0,
};

export const LISTING_CARD_TEXT_STACK_SX = {
  display: "flex",
  flexDirection: "column",
  gap: 0.55,
};

export function SoldRibbon({ size = "default" }) {
  const isLarge = size === "large";

  return (
    <Box
      sx={{
        position: "absolute",
        top: isLarge ? 24 : 18,
        right: isLarge ? -44 : -34,
        width: isLarge ? 180 : 140,
        py: isLarge ? 0.95 : 0.75,
        textAlign: "center",
        backgroundColor: "rgba(35, 35, 35, 0.92)",
        color: "common.white",
        fontSize: isLarge ? "0.82rem" : "0.72rem",
        fontWeight: 800,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        transform: "rotate(35deg)",
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
        px: isLarge ? 1.4 : 1.1,
        py: isLarge ? 0.65 : 0.45,
        borderRadius: 999,
        backgroundColor: "warning.main",
        color: "warning.contrastText",
        fontSize: isLarge ? "0.82rem" : "0.72rem",
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

export function getSoldMediaSx(baseSx = {}) {
  return {
    ...baseSx,
    filter: "grayscale(0.2) brightness(0.9)",
    opacity: 0.88,
  };
}

export function getSoldPlaceholderSx(baseSx = {}) {
  return {
    ...baseSx,
    opacity: 0.88,
  };
}

export function ListingCardMediaFrame({
  imageUrl,
  alt,
  isSold = false,
  isPending = false,
  topLeftAdornment = null,
  imageSx = {},
  placeholderSx = {},
  placeholderLabel = "No Image",
}) {
  const resolvedImageSx = isSold ? getSoldMediaSx(imageSx) : imageSx;
  const resolvedPlaceholderSx = isSold
    ? getSoldPlaceholderSx(placeholderSx)
    : placeholderSx;

  return (
    <>
      {isSold && <SoldRibbon />}
      {isPending && !isSold && <PendingBadge />}
      {!isPending && topLeftAdornment}
      {imageUrl ? (
        <CardMedia
          component="img"
          image={imageUrl}
          alt={alt}
          sx={{
            width: "100%",
            aspectRatio: "1 / 1",
            ...resolvedImageSx,
          }}
        />
      ) : (
        <Box
          sx={{
            width: "100%",
            aspectRatio: "1 / 1",
            ...resolvedPlaceholderSx,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {placeholderLabel}
          </Typography>
        </Box>
      )}
    </>
  );
}
