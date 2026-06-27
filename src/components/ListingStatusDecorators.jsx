import { Box, CardMedia, Typography } from "@mui/material";

export const LISTING_CARD_GRID_SX = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    md: "repeat(4, minmax(0, 1fr))",
    lg: "repeat(5, minmax(0, 1fr))",
  },
  gap: { xs: 1, md: 1.25 },
  alignItems: "stretch",
};

export const LISTING_CARD_SX = {
  display: "flex",
  flexDirection: "column",
  position: "relative",
  height: "100%",
  bgcolor: "rgba(248, 250, 252, 0.78)",
  boxShadow: "none",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 2,
  overflow: "hidden",
  color: "text.primary",
  p: { xs: 1, sm: 1.25 },
  isolation: "isolate",
  transition:
    "box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease",
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: 2,
    pointerEvents: "none",
    opacity: 0,
    zIndex: 3,
    outline: "2px solid rgba(78, 91, 214, 0.45)",
    outlineOffset: "-2px",
    boxShadow:
      "0 18px 38px rgba(31, 53, 99, 0.18), 0 0 0 4px rgba(78, 91, 214, 0.08)",
    transition: "opacity 180ms ease",
  },
  "&:hover": {
    bgcolor: "transparent",
    boxShadow: "0 14px 32px rgba(31, 53, 99, 0.18)",
  },
  "&:hover::after": {
    opacity: 1,
  },
  "& .listing-card-media-frame": {
    transition: "border-color 180ms ease, box-shadow 180ms ease",
  },
  "& .listing-card-media-image": {
    transition: "transform 220ms ease",
  },
  "&:hover .listing-card-media-frame": {
    borderColor: "transparent",
  },
  "&:hover .listing-card-media-image": {
    transform: "scale(1.035)",
  },
};

export const LISTING_CARD_CONTENT_SX = {
  display: "flex",
  flexDirection: "column",
  gap: 0.75,
  flexGrow: 1,
  px: 0.25,
  pt: 1,
  pb: 0.25,
  "&:last-child": { pb: 0.25 },
};

export const LISTING_CARD_TITLE_SX = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  minHeight: "2.35rem",
  lineHeight: 1.18,
  fontSize: { xs: "0.92rem", sm: "0.98rem" },
  fontWeight: 500,
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
        top: isLarge ? 18 : 12,
        left: isLarge ? 18 : 12,
        px: isLarge ? 1.4 : 1.1,
        py: isLarge ? 0.65 : 0.45,
        borderRadius: 999,
        textAlign: "center",
        backgroundColor: "rgba(35, 35, 35, 0.92)",
        color: "common.white",
        fontSize: isLarge ? "0.82rem" : "0.72rem",
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
        px: isLarge ? 1.4 : 1.1,
        py: isLarge ? 0.65 : 0.45,
        borderRadius: 999,
        backgroundColor: "error.main",
        color: "error.contrastText",
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
