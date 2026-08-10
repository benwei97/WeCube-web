import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { collection, getDocs, query, where } from "firebase/firestore";
import Screen from "../components/Screen";
import MobileListingCard from "../components/MobileListingCard";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import {
  getCompetitionTags,
  shouldShowListingInMarketplace,
  sortListingsByAvailabilityAndDate,
} from "../utils/listingUtils";
import { getCompetitionById } from "../utils/wcaApi";

function getCompetitionMeta(competition) {
  return [competition?.city, competition?.country, competition?.dateRange]
    .filter(Boolean)
    .join(" · ");
}

function getSearchText(listing) {
  return [listing.title, listing.description, listing.puzzleType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function CompetitionListingsScreen({ navigation, route }) {
  const competitionId = route.params?.competitionId;
  const initialCompetition = route.params?.competition || null;
  const [competition, setCompetition] = useState(initialCompetition);
  const [listings, setListings] = useState([]);
  const [loadingCompetition, setLoadingCompetition] = useState(!initialCompetition);
  const [loadingListings, setLoadingListings] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (competition || !competitionId) {
      setLoadingCompetition(false);
      return undefined;
    }

    let active = true;
    setLoadingCompetition(true);

    async function loadCompetition() {
      try {
        const nextCompetition = await getCompetitionById(competitionId);
        if (active) setCompetition(nextCompetition);
      } catch (competitionError) {
        console.error("Error loading mobile competition:", competitionError);
        if (active) setError("Unable to load this competition.");
      } finally {
        if (active) setLoadingCompetition(false);
      }
    }

    loadCompetition();

    return () => {
      active = false;
    };
  }, [competition, competitionId]);

  useEffect(() => {
    if (!competitionId) {
      setError("Competition is missing.");
      setLoadingListings(false);
      return undefined;
    }

    let active = true;
    setLoadingListings(true);

    async function loadListings() {
      try {
        const listingsQuery = query(
          collection(db, "listings"),
          where("competitionMeetupAvailable", "==", true)
        );
        const snapshot = await getDocs(listingsQuery);
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .filter(shouldShowListingInMarketplace)
          .filter((listing) =>
            getCompetitionTags(listing).some((item) => item.id === competitionId)
          );

        if (active) {
          setListings(sortListingsByAvailabilityAndDate(nextListings));
        }
      } catch (listingError) {
        console.error("Error loading mobile competition listings:", listingError);
        if (active) setError("Unable to load listings for this competition.");
      } finally {
        if (active) setLoadingListings(false);
      }
    }

    loadListings();

    return () => {
      active = false;
    };
  }, [competitionId]);

  const filteredListings = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) return listings;

    return listings.filter((listing) =>
      getSearchText(listing).includes(normalizedSearch)
    );
  }, [listings, searchQuery]);

  const isLoading = loadingCompetition || loadingListings;

  return (
    <Screen>
      <FlatList
        data={isLoading ? [] : filteredListings}
        numColumns={2}
        columnWrapperStyle={styles.listingRow}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.title}>{competition?.name || "Competition"}</Text>
            {competition ? (
              <Text style={styles.meta}>{getCompetitionMeta(competition)}</Text>
            ) : null}
            <View style={styles.searchPanel}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholder="Search cubes..."
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {!isLoading && !error ? (
              <Text style={styles.resultCount}>
                {filteredListings.length} cube
                {filteredListings.length === 1 ? "" : "s"} found
              </Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.listingCardSlot}>
            <MobileListingCard
              listing={item}
              style={styles.listingCard}
              onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })}
            />
          </View>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.emptyTitle}>
                {listings.length === 0 ? "No cubes available yet" : "No cubes found"}
              </Text>
              <Text style={styles.emptyText}>
                {listings.length === 0
                  ? "Be the first to list a cube for this competition."
                  : "Try a different search term."}
              </Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 32,
  },
  listingRow: {
    alignItems: "stretch",
  },
  listingCardSlot: {
    marginBottom: 8,
    paddingHorizontal: 4,
    width: "50%",
  },
  listingCard: {
    flex: 1,
  },
  header: {
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  backButton: {
    alignSelf: "flex-start",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  searchPanel: {
    marginTop: 2,
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
  resultCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
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
    fontSize: 14,
    fontWeight: "700",
  },
});
