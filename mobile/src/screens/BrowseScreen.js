import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

const FULFILLMENT_FILTERS = [
  { label: "Shipping", value: "shipping" },
  { label: "Local", value: "local" },
  { label: "Competition", value: "competition" },
];
const CONDITION_FILTERS = ["new", "like-new", "used"];
const PUZZLE_TYPE_FILTERS = ["3x3", "2x2", "4x4", "5x5", "Pyraminx", "Other"];
const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Price low", value: "price-low" },
  { label: "Price high", value: "price-high" },
];

function getSearchText(listing) {
  const competitionTags = [
    ...(listing.meetupCompetitionTags || []),
    ...(listing.competitions || []),
  ];

  return [
    listing.title,
    listing.description,
    listing.condition,
    listing.puzzleType,
    listing.meetupLocationLabel,
    ...competitionTags.flatMap((competition) => [
      competition.name,
      competition.displayName,
      competition.city,
      competition.country,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFulfillment(listing, fulfillmentFilter) {
  if (!fulfillmentFilter) return true;
  if (fulfillmentFilter === "shipping") return Boolean(listing.shippingAvailable);
  if (fulfillmentFilter === "local") return Boolean(listing.localMeetupAvailable);
  if (fulfillmentFilter === "competition") return Boolean(listing.competitionMeetupAvailable);
  return true;
}

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
          {[listing.condition || "Condition not set", listing.puzzleType]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

function FilterChip({ label, selected, onPress }) {
  return (
    <Pressable
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function BrowseScreen({ navigation }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [puzzleTypeFilter, setPuzzleTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

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

  const visibleListings = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return listings
      .filter((listing) => {
        const matchesSearch =
          !normalizedSearch || getSearchText(listing).includes(normalizedSearch);
        const matchesCondition =
          !conditionFilter || listing.condition === conditionFilter;
        const matchesPuzzleType =
          !puzzleTypeFilter || listing.puzzleType === puzzleTypeFilter;

        return (
          matchesSearch &&
          matchesCondition &&
          matchesPuzzleType &&
          matchesFulfillment(listing, fulfillmentFilter)
        );
      })
      .sort((a, b) => {
        if (sortBy === "price-low") {
          return Number(a.price || 0) - Number(b.price || 0);
        }
        if (sortBy === "price-high") {
          return Number(b.price || 0) - Number(a.price || 0);
        }
        return getDateTime(b.createdAt) - getDateTime(a.createdAt);
      });
  }, [conditionFilter, fulfillmentFilter, listings, puzzleTypeFilter, searchQuery, sortBy]);

  function clearFilters() {
    setSearchQuery("");
    setFulfillmentFilter("");
    setConditionFilter("");
    setPuzzleTypeFilter("");
    setSortBy("newest");
  }

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
        data={visibleListings}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.filters}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholder="Search listings"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.filterLabel}>Fulfillment</Text>
            <View style={styles.filterRow}>
              {FULFILLMENT_FILTERS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={fulfillmentFilter === option.value}
                  onPress={() =>
                    setFulfillmentFilter((current) =>
                      current === option.value ? "" : option.value
                    )
                  }
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Puzzle</Text>
            <View style={styles.filterRow}>
              {PUZZLE_TYPE_FILTERS.map((option) => (
                <FilterChip
                  key={option}
                  label={option}
                  selected={puzzleTypeFilter === option}
                  onPress={() =>
                    setPuzzleTypeFilter((current) => (current === option ? "" : option))
                  }
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Condition</Text>
            <View style={styles.filterRow}>
              {CONDITION_FILTERS.map((option) => (
                <FilterChip
                  key={option}
                  label={option}
                  selected={conditionFilter === option}
                  onPress={() =>
                    setConditionFilter((current) => (current === option ? "" : option))
                  }
                />
              ))}
            </View>

            <View style={styles.sortHeader}>
              <Text style={styles.filterLabel}>Sort</Text>
              <Pressable onPress={clearFilters}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.filterRow}>
              {SORT_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={sortBy === option.value}
                  onPress={() => setSortBy(option.value)}
                />
              ))}
            </View>
            <Text style={styles.resultCount}>
              {visibleListings.length} listing{visibleListings.length === 1 ? "" : "s"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No matching listings</Text>
            <Text style={styles.emptyText}>Try clearing filters or searching for something else.</Text>
          </View>
        }
      />
    );
  }, [
    conditionFilter,
    error,
    fulfillmentFilter,
    loading,
    navigation,
    puzzleTypeFilter,
    searchQuery,
    sortBy,
    visibleListings,
  ]);

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 12,
  },
  filters: {
    gap: 8,
    marginBottom: 4,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  filterChipTextSelected: {
    color: "#fff",
  },
  sortHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  clearText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  resultCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
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
