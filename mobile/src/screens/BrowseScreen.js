import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import Screen from "../components/Screen";
import MobileListingCard from "../components/MobileListingCard";
import { db } from "../lib/firebase";
import {
  getLocationMatchInfo,
  shouldShowListingInMarketplace,
  sortListingsByAvailabilityAndDate,
} from "../utils/listingUtils";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import { colors } from "../theme/colors";

const DEFAULT_LOCATION_RADIUS_MILES = 25;
const LOCATION_RADIUS_OPTIONS = [5, 10, 25, 50, 100];

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

function OptionChip({ label, selected, onPress }) {
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

function getInitialLocationDraft(locationFilter) {
  return {
    locationInput: locationFilter.locationInput,
    locationOption: locationFilter.locationOption,
    radiusMiles: locationFilter.radiusMiles,
    includeLocalMeetups: locationFilter.includeLocalMeetups,
    includeCompetitionMeetups: locationFilter.includeCompetitionMeetups,
    includeShippableListings: locationFilter.includeShippableListings,
  };
}

export default function BrowseScreen({ navigation }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState({
    locationInput: "",
    locationOption: null,
    radiusMiles: DEFAULT_LOCATION_RADIUS_MILES,
    includeLocalMeetups: true,
    includeCompetitionMeetups: true,
    includeShippableListings: true,
  });
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState(() =>
    getInitialLocationDraft(locationFilter)
  );
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "listings"),
      (snapshot) => {
        const nextListings = snapshot.docs
          .map((listingDoc) => ({ id: listingDoc.id, ...listingDoc.data() }))
          .filter(shouldShowListingInMarketplace);
        setListings(sortListingsByAvailabilityAndDate(nextListings));
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

  useEffect(() => {
    let active = true;
    const queryText = locationDraft.locationInput.trim();

    if (!locationModalOpen || queryText.length < 2) {
      setLocationOptions([]);
      setLoadingLocations(false);
      return undefined;
    }

    setLoadingLocations(true);
    const timeoutId = setTimeout(async () => {
      try {
        const options = await fetchLocationSuggestionOptions(queryText);
        if (active) setLocationOptions(options);
      } catch (locationError) {
        console.error("Error loading mobile location suggestions:", locationError);
        if (active) setLocationOptions([]);
      } finally {
        if (active) setLoadingLocations(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [locationDraft.locationInput, locationModalOpen]);

  const visibleListings = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const hasLocationFilter = Boolean(locationFilter.locationOption);

    const filteredListings = listings.filter((listing) => {
      const matchesSearch =
        !normalizedSearch || getSearchText(listing).includes(normalizedSearch);
      if (!matchesSearch) return false;
      if (!hasLocationFilter) return true;

      const locationMatch = getLocationMatchInfo(listing, locationFilter);
      return locationMatch.matchesLocation || locationMatch.matchesShipping;
    });

    return sortListingsByAvailabilityAndDate(filteredListings);
  }, [listings, locationFilter, searchQuery]);

  const locationButtonLabel = locationFilter.locationOption
    ? locationFilter.locationOption.city || locationFilter.locationOption.label
    : "All locations";

  const openLocationModal = useCallback(() => {
    setLocationDraft(getInitialLocationDraft(locationFilter));
    setLocationModalOpen(true);
  }, [locationFilter]);

  function clearLocationFilter() {
    const nextFilter = {
      locationInput: "",
      locationOption: null,
      radiusMiles: DEFAULT_LOCATION_RADIUS_MILES,
      includeLocalMeetups: true,
      includeCompetitionMeetups: true,
      includeShippableListings: true,
    };
    setLocationFilter(nextFilter);
    setLocationDraft(nextFilter);
    setLocationOptions([]);
    setLocationModalOpen(false);
  }

  function applyLocationFilter() {
    setLocationFilter(locationDraft);
    setLocationModalOpen(false);
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
        numColumns={2}
        columnWrapperStyle={styles.listingRow}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.filters}>
            <Text style={styles.screenTitle}>Browse Cubes</Text>
            <View style={styles.searchPanel}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholder="Search cubes..."
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[
                  styles.locationButton,
                  locationFilter.locationOption && styles.locationButtonActive,
                ]}
                onPress={openLocationModal}
                accessibilityLabel={locationButtonLabel}
              >
                <Text
                  style={[
                    styles.locationButtonText,
                    locationFilter.locationOption && styles.locationButtonTextActive,
                  ]}
                >
                  ⌖
                </Text>
              </Pressable>
            </View>
            <Text style={styles.resultCount}>
              {visibleListings.length} cube{visibleListings.length === 1 ? "" : "s"} found
            </Text>
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
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>No matching listings</Text>
            <Text style={styles.emptyText}>Try clearing filters or searching for something else.</Text>
          </View>
        }
      />
    );
  }, [
    error,
    locationButtonLabel,
    locationFilter.locationOption,
    loading,
    navigation,
    openLocationModal,
    searchQuery,
    visibleListings,
  ]);

  return (
    <Screen>
      {content}
      <Modal
        animationType="slide"
        transparent
        visible={locationModalOpen}
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.locationPanel}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Location</Text>
                <Text style={styles.modalSubtitle}>
                  Find listings available near this location.
                </Text>
              </View>
              <Pressable onPress={() => setLocationModalOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              value={locationDraft.locationInput}
              onChangeText={(value) =>
                setLocationDraft((prev) => ({
                  ...prev,
                  locationInput: value,
                  locationOption:
                    value === prev.locationOption?.label ? prev.locationOption : null,
                }))
              }
              style={styles.searchInput}
              placeholder="Search location"
              autoCapitalize="words"
            />

            {loadingLocations ? (
              <ActivityIndicator color={colors.primary} style={styles.locationLoader} />
            ) : null}

            {locationOptions.length > 0 ? (
              <ScrollView style={styles.locationOptions}>
                {locationOptions.map((option) => {
                  const selected =
                    locationDraft.locationOption?.label === option.label;
                  return (
                    <Pressable
                      key={option.label}
                      style={[
                        styles.locationOption,
                        selected && styles.locationOptionSelected,
                      ]}
                      onPress={() =>
                        setLocationDraft((prev) => ({
                          ...prev,
                          locationInput: getLocationOptionLabel(option),
                          locationOption: option,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.locationOptionText,
                          selected && styles.locationOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <Text style={styles.filterLabel}>
              Radius: {locationDraft.radiusMiles} miles
            </Text>
            <View style={styles.filterRow}>
              {LOCATION_RADIUS_OPTIONS.map((radius) => (
                <OptionChip
                  key={radius}
                  label={`${radius}`}
                  selected={locationDraft.radiusMiles === radius}
                  onPress={() =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      radiusMiles: radius,
                    }))
                  }
                />
              ))}
            </View>

            <View style={styles.switchBlock}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Local meetups</Text>
                <Switch
                  value={locationDraft.includeLocalMeetups}
                  onValueChange={(value) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      includeLocalMeetups: value,
                    }))
                  }
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Competition meetups</Text>
                <Switch
                  value={locationDraft.includeCompetitionMeetups}
                  onValueChange={(value) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      includeCompetitionMeetups: value,
                    }))
                  }
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Shippable listings</Text>
                <Switch
                  value={locationDraft.includeShippableListings}
                  onValueChange={(value) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      includeShippableListings: value,
                    }))
                  }
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={clearLocationFilter}>
                <Text style={styles.secondaryButtonText}>Clear location</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  !locationDraft.locationOption && styles.primaryButtonDisabled,
                ]}
                onPress={applyLocationFilter}
                disabled={!locationDraft.locationOption}
              >
                <Text style={styles.primaryButtonText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  filters: {
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 2,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  searchPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "rgba(148, 163, 184, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    padding: 16,
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    height: 44,
    width: 44,
  },
  locationButtonActive: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  locationButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  locationButtonTextActive: {
    color: colors.primary,
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
  resultCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
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
  modalOverlay: {
    backgroundColor: "rgba(15, 23, 42, 0.34)",
    flex: 1,
    justifyContent: "flex-end",
  },
  locationPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "88%",
    padding: 18,
  },
  modalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  closeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 4,
  },
  locationLoader: {
    marginTop: 12,
  },
  locationOptions: {
    marginTop: 10,
    maxHeight: 190,
  },
  locationOption: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationOptionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  locationOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  locationOptionTextSelected: {
    color: colors.primary,
  },
  switchBlock: {
    marginTop: 14,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
});
