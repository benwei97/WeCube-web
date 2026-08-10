import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { colors } from "../theme/colors";

const DEFAULT_RADIUS_MILES = 3;
const METERS_PER_MILE = 1609.344;
const MILES_PER_LATITUDE_DEGREE = 69;

function hasCoordinates(location) {
  return (
    Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude))
  );
}

function getRegion(latitude, longitude, radiusMiles) {
  const latitudeDelta = Math.max((radiusMiles * 2.8) / MILES_PER_LATITUDE_DEGREE, 0.08);
  const longitudeMilesPerDegree =
    MILES_PER_LATITUDE_DEGREE *
    Math.max(Math.cos((latitude * Math.PI) / 180), 0.1);
  const longitudeDelta = Math.max((radiusMiles * 2.8) / longitudeMilesPerDegree, 0.08);

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

export default function ApproximateMeetupMap({
  location,
  label,
  radiusMiles = DEFAULT_RADIUS_MILES,
}) {
  if (!hasCoordinates(location)) return null;

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const coordinate = { latitude, longitude };
  const radiusMeters = radiusMiles * METERS_PER_MILE;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={getRegion(latitude, longitude, radiusMiles)}
        mapType="standard"
        pitchEnabled={false}
        rotateEnabled={false}
        showsCompass={false}
      >
        <Circle
          center={coordinate}
          radius={radiusMeters}
          strokeColor="rgba(37, 99, 235, 0.72)"
          fillColor="rgba(37, 99, 235, 0.16)"
          strokeWidth={2}
        />
        <Marker
          coordinate={coordinate}
          title={label || "Approximate meetup area"}
          description="Location is approximate"
        />
      </MapView>
      <View style={styles.captionRow}>
        <Text style={styles.captionTitle} numberOfLines={1}>
          {label || "Approximate meetup area"}
        </Text>
        <Text style={styles.captionText}>Location is approximate</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden",
  },
  map: {
    height: 170,
    width: "100%",
  },
  captionRow: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  captionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  captionText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
