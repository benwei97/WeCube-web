import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
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

  return (
    <View style={styles.fulfillmentLine}>
      <Text style={styles.fulfillmentIcon}>{option.icon}</Text>
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
        <Text style={styles.title} numberOfLines={2}>
          {listing.title || "Untitled listing"}
        </Text>
        <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
        <ListingFulfillmentLine option={getPrimaryFulfillmentOption(listing)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.softSurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 1,
    overflow: "hidden",
    padding: 8,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
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
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
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
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  content: {
    gap: 6,
    paddingHorizontal: 2,
    paddingBottom: 2,
    paddingTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 17,
    minHeight: 34,
  },
  price: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 17,
  },
  fulfillmentLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minWidth: 0,
  },
  fulfillmentIcon: {
    color: colors.muted,
    fontSize: 12,
    width: 14,
  },
  fulfillmentText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
});
