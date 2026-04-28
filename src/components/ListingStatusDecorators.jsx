import { Box, CardMedia, Typography } from "@mui/material";

export function SoldRibbon() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 18,
        right: -34,
        width: 140,
        py: 0.75,
        textAlign: "center",
        backgroundColor: "rgba(35, 35, 35, 0.92)",
        color: "common.white",
        fontSize: "0.72rem",
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
  topLeftAdornment = null,
  height = 200,
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
      {topLeftAdornment}
      {imageUrl ? (
        <CardMedia
          component="img"
          height={height}
          image={imageUrl}
          alt={alt}
          sx={resolvedImageSx}
        />
      ) : (
        <Box sx={resolvedPlaceholderSx}>
          <Typography variant="body2" color="text.secondary">
            {placeholderLabel}
          </Typography>
        </Box>
      )}
    </>
  );
}
