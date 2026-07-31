import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { formatListingPrice } from "../utils/listingUtils";
import { getS3PublicUrl } from "../utils/s3";

function formatShipping(listing) {
  if (!listing?.shippingAvailable) return null;
  if (listing.shippingIncluded || Number(listing.shippingCost || 0) === 0) {
    return "Shipping: free";
  }
  return `Shipping: +${formatListingPrice(listing.shippingCost)}`;
}

function formatFulfillment(listing) {
  const options = [];
  if (listing?.shippingAvailable) options.push(formatShipping(listing));
  if (listing?.localMeetupAvailable) options.push("Local meetup");
  if (listing?.competitionMeetupAvailable) options.push("Competition meetup");
  return options.filter(Boolean);
}

export default function ListingDetailScreen({ route }) {
  const { currentUser } = useAuth();
  const { listingId } = route.params || {};
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (!listingId) {
      setError("Listing is missing.");
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "listings", listingId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Listing not found.");
          setListing(null);
        } else {
          setListing({ id: snapshot.id, ...snapshot.data() });
          setError("");
        }
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Error loading mobile listing detail:", snapshotError);
        setError("Unable to load this listing.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [listingId]);

  const photos = listing?.photos || [];
  const activePhoto = photos[photoIndex];
  const activePhotoUrl = activePhoto?.s3Key ? getS3PublicUrl(activePhoto.s3Key) : null;
  const fulfillmentOptions = useMemo(() => formatFulfillment(listing), [listing]);
  const isOwnListing = currentUser?.uid && currentUser.uid === listing?.userId;

  function handlePreviousPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  }

  function handleNextPhoto() {
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  }

  function handleMessageSeller() {
    if (!currentUser) {
      Alert.alert("Sign in required", "Sign in to message sellers.");
      return;
    }

    if (isOwnListing) {
      Alert.alert("Your listing", "You cannot message yourself about your own listing.");
      return;
    }

    Alert.alert("Coming next", "Messaging from mobile will be connected in the next pass.");
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {activePhotoUrl ? (
          <Image source={{ uri: activePhotoUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No photo</Text>
          </View>
        )}

        {photos.length > 1 && (
          <View style={styles.photoControls}>
            <Pressable style={styles.photoButton} onPress={handlePreviousPhoto}>
              <Text style={styles.photoButtonText}>Previous</Text>
            </Pressable>
            <Text style={styles.photoCount}>
              {photoIndex + 1} / {photos.length}
            </Text>
            <Pressable style={styles.photoButton} onPress={handleNextPhoto}>
              <Text style={styles.photoButtonText}>Next</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.title}>{listing.title || "Untitled listing"}</Text>
          <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{listing.condition || "Condition not set"}</Text>
            {listing.puzzleType ? <Text style={styles.metaPill}>{listing.puzzleType}</Text> : null}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Fulfillment</Text>
          {fulfillmentOptions.length ? (
            fulfillmentOptions.map((option) => (
              <Text key={option} style={styles.bodyText}>
                {option}
              </Text>
            ))
          ) : (
            <Text style={styles.bodyText}>Fulfillment options not set.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.bodyText}>
            {listing.description || "No description provided."}
          </Text>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleMessageSeller}>
          <Text style={styles.primaryButtonText}>
            {isOwnListing ? "Your listing" : "Message seller"}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  heroImage: {
    aspectRatio: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  photoControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  photoButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  photoButtonText: {
    color: colors.primary,
    fontWeight: "800",
  },
  photoCount: {
    color: colors.muted,
    fontWeight: "700",
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  price: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "capitalize",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 8,
  },
  bodyText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
