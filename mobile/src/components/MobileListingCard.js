import { MaterialIcons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { elevation, radii, typography } from "../theme/design";
import { getS3PublicUrl } from "../utils/s3";
import {
  formatListingPrice,
  getPrimaryFulfillmentOption,
} from "../utils/listingUtils";

function StatusBadge({ status }) {
  const label = status === "sold" ? "Sold" : status === "archived" ? "Pending" : "";
  if (!label) return null;

  return (
    <View style={[styles.statusBadge, status === "archived" && styles.pendingBadge]}>
      <Text style={styles.statusBadgeText}>{label}</Text>
    </View>
  );
}

export function ListingFulfillmentLine({ option }) {
  if (!option) return null;

  const iconName =
    option.type === "shipping"
      ? "local-shipping"
      : option.type === "local"
        ? "location-on"
        : option.type === "competition"
          ? "groups"
          : "info-outline";

  return (
    <View style={styles.fulfillmentLine}>
      <MaterialIcons name={iconName} size={14} color={colors.muted} />
      <Text style={styles.fulfillmentText} numberOfLines={1}>
        {option.label}
      </Text>
    </View>
  );
}

export function ListingCardMediaFrame({ listing, sizeStyle }) {
  const imageUrl = listing.photos?.[0]?.s3Key
    ? getS3PublicUrl(listing.photos[0].s3Key)
    : null;
  const isSold = listing.status === "sold";

  return (
    <View style={[styles.mediaFrame, sizeStyle]}>
      <StatusBadge status={listing.status} />
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.mediaImage, isSold && styles.soldImage]}
        />
      ) : (
        <View style={[styles.mediaImage, styles.placeholder]}>
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}
    </View>
  );
}

export default function MobileListingCard({ listing, onPress, style }) {
  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <ListingCardMediaFrame listing={listing} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {listing.title || "Untitled listing"}
        </Text>
        <Text style={styles.price} numberOfLines={1} ellipsizeMode="tail">
          {formatListingPrice(listing.price)}
        </Text>
        <ListingFulfillmentLine option={getPrimaryFulfillmentOption(listing)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.softSurface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    elevation: 1,
    overflow: "hidden",
    padding: 8,
    ...elevation.card,
  },
  mediaFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  mediaImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  soldImage: {
    opacity: 0.88,
  },
  placeholder: {
    alignItems: "center",
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
  },
  placeholderText: {
    ...typography.caption,
    color: colors.muted,
  },
  statusBadge: {
    backgroundColor: "rgba(35, 35, 35, 0.92)",
    borderRadius: 999,
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    position: "absolute",
    top: 12,
    zIndex: 2,
  },
  pendingBadge: {
    backgroundColor: colors.danger,
  },
  statusBadgeText: {
    fontFamily: typography.caption.fontFamily,
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  content: {
    gap: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
    paddingTop: 8,
  },
  title: {
    ...typography.listingTitle,
    color: colors.text,
  },
  price: {
    ...typography.listingPrice,
    color: colors.text,
    minWidth: 0,
  },
  fulfillmentLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minWidth: 0,
  },
  fulfillmentText: {
    ...typography.caption,
    color: colors.muted,
    flex: 1,
  },
});
