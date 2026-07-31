import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import Screen from "../components/Screen";
import { db } from "../lib/firebase";
import { getS3PublicUrl } from "../utils/s3";
import { formatListingPrice, getDateTime } from "../utils/listingUtils";
import { colors } from "../theme/colors";

function ListingCard({ listing, onPress }) {
  const thumbnailUrl = listing.photos?.[0]?.s3Key
    ? getS3PublicUrl(listing.photos[0].s3Key)
    : null;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>No photo</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title || "Untitled listing"}
        </Text>
        <Text style={styles.price}>{formatListingPrice(listing.price)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {listing.condition || "Condition not set"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function BrowseScreen({ navigation }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const listingsQuery = query(
      collection(db, "listings"),
      where("status", "==", "active")
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .filter((listing) => listing.moderationStatus !== "hidden")
          .sort((a, b) => getDateTime(b.createdAt) - getDateTime(a.createdAt));
        setListings(nextListings);
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Error loading mobile listings:", snapshotError);
        setError("Unable to load listings.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.error}>{error}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No active listings yet</Text>
            <Text style={styles.emptyText}>Listings from this Firebase environment will appear here.</Text>
          </View>
        }
      />
    );
  }, [error, listings, loading, navigation]);

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  image: {
    backgroundColor: "#e2e8f0",
    height: 104,
    width: 104,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  cardBody: {
    flex: 1,
    justifyContent: "center",
    padding: 12,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  price: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 6,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    textTransform: "capitalize",
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
