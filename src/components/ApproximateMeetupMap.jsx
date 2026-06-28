import { Box, Paper, Typography } from "@mui/material";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";

const DEFAULT_APPROXIMATE_RADIUS_MILES = 3;
const MILES_PER_LATITUDE_DEGREE = 69;
const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";
const APPROXIMATE_AREA_SOURCE_ID = "approximate-meetup-area";
const APPROXIMATE_AREA_FILL_LAYER_ID = "approximate-meetup-area-fill";
const APPROXIMATE_AREA_OUTLINE_LAYER_ID = "approximate-meetup-area-outline";

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

function createApproximateCircleFeature(location, radiusMiles) {
  const points = 96;
  const coordinates = [];
  const latitudeRadians = (location.latitude * Math.PI) / 180;
  const latitudeDelta = radiusMiles / MILES_PER_LATITUDE_DEGREE;
  const longitudeDelta =
    radiusMiles /
    (MILES_PER_LATITUDE_DEGREE * Math.max(Math.cos(latitudeRadians), 0.1));

  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    coordinates.push([
      location.longitude + longitudeDelta * Math.cos(angle),
      location.latitude + latitudeDelta * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
    properties: {},
  };
}

function getOsmEmbedUrl(location, radiusMiles) {
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

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik`;
}

function InteractiveMapboxArea({ location, radiusMiles }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return undefined;
    }

    let isMounted = true;

    async function initializeMap() {
      try {
        const mapboxModule = await import("mapbox-gl");

        if (!isMounted || !mapContainerRef.current) {
          return;
        }

        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: MAPBOX_STYLE,
          center: [location.longitude, location.latitude],
          zoom: getMapboxZoom(radiusMiles),
          minZoom: 7,
          maxZoom: 12,
          attributionControl: true,
          cooperativeGestures: true,
        });

        mapRef.current = map;
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();

        map.on("error", () => {
          if (isMounted) {
            setMapError(true);
          }
        });

        map.on("load", () => {
          if (!isMounted) {
            return;
          }

          const circleFeature = createApproximateCircleFeature(
            location,
            radiusMiles
          );

          map.addSource(APPROXIMATE_AREA_SOURCE_ID, {
            type: "geojson",
            data: circleFeature,
          });

          map.addLayer({
            id: APPROXIMATE_AREA_FILL_LAYER_ID,
            type: "fill",
            source: APPROXIMATE_AREA_SOURCE_ID,
            paint: {
              "fill-color": "#1976d2",
              "fill-opacity": 0.18,
            },
          });

          map.addLayer({
            id: APPROXIMATE_AREA_OUTLINE_LAYER_ID,
            type: "line",
            source: APPROXIMATE_AREA_SOURCE_ID,
            paint: {
              "line-color": "#1976d2",
              "line-width": 2,
            },
          });

          const bounds = getMapBounds(
            location.latitude,
            location.longitude,
            radiusMiles
          );
          map.fitBounds(
            [
              [bounds.west, bounds.south],
              [bounds.east, bounds.north],
            ],
            { padding: 36, duration: 0, maxZoom: 12 }
          );
        });
      } catch (error) {
        console.error("Error loading interactive meetup map:", error);
        if (isMounted) {
          setMapError(true);
        }
      }
    }

    initializeMap();

    return () => {
      isMounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [location, radiusMiles]);

  if (mapError) {
    return (
      <Box
        component="iframe"
        title="Approximate meetup area fallback map"
        src={getOsmEmbedUrl(location, radiusMiles)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
        }}
      />
    );
  }

  return (
    <Box
      ref={mapContainerRef}
      sx={{
        position: "absolute",
        inset: 0,
        "& .mapboxgl-control-container": {
          fontSize: 10,
        },
      }}
    />
  );
}

export default function ApproximateMeetupMap({
  location,
  label,
  radiusMiles = DEFAULT_APPROXIMATE_RADIUS_MILES,
}) {
  if (!hasCoordinates(location)) {
    return null;
  }

  const hasMapboxToken = Boolean(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN);
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
        {hasMapboxToken ? (
          <InteractiveMapboxArea
            location={location}
            radiusMiles={radiusMiles}
          />
        ) : (
          <Box
            component="iframe"
            title={mapTitle}
            src={getOsmEmbedUrl(location, radiusMiles)}
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
      </Box>
      <Box sx={{ px: 1.5, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Location is approximate
        </Typography>
      </Box>
    </Paper>
  );
}
