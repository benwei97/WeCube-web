import { Box, Paper, Typography } from "@mui/material";

const DEFAULT_APPROXIMATE_RADIUS_MILES = 3;
const MILES_PER_LATITUDE_DEGREE = 69;
const MAPBOX_STATIC_IMAGE_SIZE = "640x360";
const MAPBOX_STYLE = "mapbox/light-v11";

function getMapboxZoom(radiusMiles) {
  if (radiusMiles <= 2) {
    return 12;
  }

  if (radiusMiles <= 5) {
    return 11;
  }

  if (radiusMiles <= 10) {
    return 10;
  }

  return 9;
}

function getMapBounds(latitude, longitude, radiusMiles) {
  const latitudeDelta = radiusMiles / MILES_PER_LATITUDE_DEGREE;
  const longitudeMilesPerDegree =
    MILES_PER_LATITUDE_DEGREE *
    Math.max(Math.cos((latitude * Math.PI) / 180), 0.1);
  const longitudeDelta = radiusMiles / longitudeMilesPerDegree;

  return {
    west: longitude - longitudeDelta,
    south: latitude - latitudeDelta,
    east: longitude + longitudeDelta,
    north: latitude + latitudeDelta,
  };
}

function hasCoordinates(location) {
  return (
    typeof location?.latitude === "number" &&
    typeof location?.longitude === "number"
  );
}

function getMapboxStaticImageUrl(location, radiusMiles) {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    return "";
  }

  const longitude = Number(location.longitude).toFixed(5);
  const latitude = Number(location.latitude).toFixed(5);
  const zoom = getMapboxZoom(radiusMiles);

  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${longitude},${latitude},${zoom},0/${MAPBOX_STATIC_IMAGE_SIZE}@2x?access_token=${encodeURIComponent(
    accessToken
  )}&attribution=true&logo=false`;
}

export default function ApproximateMeetupMap({
  location,
  label,
  radiusMiles = DEFAULT_APPROXIMATE_RADIUS_MILES,
}) {
  if (!hasCoordinates(location)) {
    return null;
  }

  const bounds = getMapBounds(
    location.latitude,
    location.longitude,
    radiusMiles
  );
  const bbox = [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ].join(",");
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik`;
  const mapboxImageUrl = getMapboxStaticImageUrl(location, radiusMiles);
  const mapTitle = `Approximate meetup area${label ? ` near ${label}` : ""}`;

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 1.5,
        overflow: "hidden",
        borderRadius: 2,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          position: "relative",
          height: { xs: 180, sm: 220 },
          bgcolor: "grey.100",
        }}
      >
        {mapboxImageUrl ? (
          <Box
            component="img"
            alt={mapTitle}
            src={mapboxImageUrl}
            loading="lazy"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              filter: "saturate(0.82) contrast(0.96)",
            }}
          />
        ) : (
          <Box
            component="iframe"
            title={mapTitle}
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sx={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
            }}
          />
        )}
        <Box
          sx={{
            position: "absolute",
            inset: "21% 29%",
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "primary.main",
            bgcolor: "primary.main",
            opacity: 0.2,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: "21% 29%",
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "primary.main",
            boxShadow: "0 0 0 999px rgba(255, 255, 255, 0.08)",
            pointerEvents: "none",
          }}
        />
      </Box>
      <Box sx={{ px: 1.5, py: 1.25 }}>
        <Typography variant="body2" fontWeight={600}>
          Approximate meetup area
        </Typography>
        <Typography variant="caption" color="text.secondary">
          The map shows a general area only. Confirm the exact meeting spot in
          chat.
        </Typography>
      </Box>
    </Paper>
  );
}
