import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import Screen from "../components/Screen";
import MobileListingCard from "../components/MobileListingCard";
import ScreenTitle from "../components/ScreenTitle";
import Toggle from "../components/Toggle";
import PageState from "../components/PageState";
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
import { radii, typography } from "../theme/design";

const DEFAULT_LOCATION_RADIUS_MILES = 25;
const LOCATION_RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const INITIAL_VISIBLE_LISTINGS = 4;
const LISTING_LOAD_INCREMENT = 8;

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

function hasFulfillmentMethodFilter(filter) {
  return (
    filter.includeLocalMeetups !== true ||
    filter.includeCompetitionMeetups !== true ||
    filter.includeShippableListings !== true
  );
}

function hasLocationFilterControls(filter) {
  return Boolean(filter.locationOption) || hasFulfillmentMethodFilter(filter);
}

function RadiusSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const trackMetricsRef = useRef({ pageX: 0, width: 0 });
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, LOCATION_RADIUS_OPTIONS.indexOf(value));
  const selectedPercent =
    selectedIndex / Math.max(LOCATION_RADIUS_OPTIONS.length - 1, 1);

  function updateFromPosition(positionX, measuredWidth = trackWidth) {
    if (!measuredWidth) return;
    const boundedPosition = Math.max(0, Math.min(positionX, measuredWidth));
    const nextIndex = Math.round(
      (boundedPosition / measuredWidth) * (LOCATION_RADIUS_OPTIONS.length - 1)
    );
    onChange(LOCATION_RADIUS_OPTIONS[nextIndex]);
  }

  function updateFromPageX(pageX) {
    const { pageX: trackPageX, width } = trackMetricsRef.current;
    updateFromPosition(pageX - trackPageX, width);
  }

  function measureTrack(callback) {
    trackRef.current?.measure((_, __, width, ___, pageX) => {
      trackMetricsRef.current = { pageX, width };
      setTrackWidth(width);
      callback?.(pageX, width);
    });
  }

  return (
    <View style={styles.radiusSliderBlock}>
      <View
        ref={trackRef}
        style={styles.radiusTrack}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setTrackWidth(width);
          trackMetricsRef.current = {
            ...trackMetricsRef.current,
            width,
          };
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) =>
          measureTrack((pageX, width) =>
            updateFromPosition(event.nativeEvent.pageX - pageX, width)
          )
        }
        onResponderMove={(event) => updateFromPageX(event.nativeEvent.pageX)}
        onResponderRelease={(event) => updateFromPageX(event.nativeEvent.pageX)}
      >
        <View pointerEvents="none" style={styles.radiusTrackRail} />
        <View
          pointerEvents="none"
          style={[styles.radiusTrackFill, { width: `${selectedPercent * 100}%` }]}
        />
        {LOCATION_RADIUS_OPTIONS.map((radius, index) => {
          const active = index <= selectedIndex;
          return (
            <View
              key={radius}
              pointerEvents="none"
              style={[
                styles.radiusTick,
                active && styles.radiusTickActive,
                { left: `${(index / (LOCATION_RADIUS_OPTIONS.length - 1)) * 100}%` },
              ]}
            />
          );
        })}
        <View
          pointerEvents="none"
          style={[styles.radiusThumb, { left: `${selectedPercent * 100}%` }]}
        />
      </View>
      <View style={styles.radiusLabels}>
        {LOCATION_RADIUS_OPTIONS.map((radius) => (
          <Pressable key={radius} onPress={() => onChange(radius)}>
            <Text
              style={[
                styles.radiusLabel,
                radius === value && styles.radiusLabelActive,
              ]}
            >
              {radius}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
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
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_LISTINGS);

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
    const hasFulfillmentFilter = hasFulfillmentMethodFilter(locationFilter);

    const filteredListings = listings.filter((listing) => {
      const matchesSearch =
        !normalizedSearch || getSearchText(listing).includes(normalizedSearch);
      if (!matchesSearch) return false;
      if (!hasLocationFilter && !hasFulfillmentFilter) return true;
      if (!hasLocationFilter) {
        return (
          (locationFilter.includeLocalMeetups && listing.localMeetupAvailable) ||
          (locationFilter.includeCompetitionMeetups && listing.competitionMeetupAvailable) ||
          (locationFilter.includeShippableListings && listing.shippingAvailable)
        );
      }

      const locationMatch = getLocationMatchInfo(listing, locationFilter);
      return locationMatch.matchesLocation || locationMatch.matchesShipping;
    });

    return sortListingsByAvailabilityAndDate(filteredListings);
  }, [listings, locationFilter, searchQuery]);

  const hasActiveFilter =
    Boolean(searchQuery.trim()) || hasLocationFilterControls(locationFilter);
  const displayedListings = hasActiveFilter
    ? visibleListings
    : visibleListings.slice(0, visibleCount);
  const hasMoreListings = !hasActiveFilter && visibleListings.length > visibleCount;

  const hasActiveLocationControls = hasLocationFilterControls(locationFilter);
  const isLocationDraftInvalid =
    Boolean(locationDraft.locationInput.trim()) && !locationDraft.locationOption;
  const locationButtonLabel = locationFilter.locationOption
    ? locationFilter.locationOption.city || locationFilter.locationOption.label
    : hasFulfillmentMethodFilter(locationFilter)
      ? "Fulfillment filters"
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
    setVisibleCount(INITIAL_VISIBLE_LISTINGS);
    setLocationModalOpen(false);
  }

  const loadMoreListings = useCallback(() => {
    if (!hasMoreListings) return;
    setVisibleCount((currentCount) => currentCount + LISTING_LOAD_INCREMENT);
  }, [hasMoreListings]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <PageState
          variant="loading"
          title="Loading listings"
        />
      );
    }

    if (error) {
      return (
        <PageState title="Unable to load listings" message={error} />
      );
    }

    return (
      <FlatList
        data={displayedListings}
        numColumns={2}
        columnWrapperStyle={styles.listingRow}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        onEndReached={loadMoreListings}
        onEndReachedThreshold={0.7}
        ListHeaderComponent={
          <View style={styles.filters}>
            <ScreenTitle>Browse Cubes</ScreenTitle>
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
                  hasActiveLocationControls && styles.locationButtonActive,
                ]}
                onPress={openLocationModal}
                accessibilityLabel={locationButtonLabel}
              >
                <MaterialIcons
                  name="location-on"
                  size={24}
                  color={hasActiveLocationControls ? colors.primary : colors.text}
                />
              </Pressable>
            </View>
            <Text style={styles.resultCount}>
              {visibleListings.length} cube{visibleListings.length === 1 ? "" : "s"} found
            </Text>
            {hasActiveFilter ? (
              <Text style={styles.searchModeText}>
                Showing all results from {listings.length} total cubes
              </Text>
            ) : null}
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
          <PageState
            title="No cubes found"
            message="Try adjusting your filters or search terms."
          />
        }
        ListFooterComponent={
          hasMoreListings ? (
            <View style={styles.footerState}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.footerText}>Scroll for more</Text>
            </View>
          ) : null
        }
      />
    );
  }, [
    displayedListings,
    error,
    hasActiveFilter,
    hasActiveLocationControls,
    hasMoreListings,
    listings.length,
    locationButtonLabel,
    loading,
    loadMoreListings,
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

            <View style={styles.searchPanel}>
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
              <View style={styles.locationSearchIcon}>
                <MaterialIcons name="search" size={22} color={colors.text} />
              </View>
            </View>

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

            <View style={styles.modalSection}>
              <View style={styles.sectionHeadingRow}>
                <Text style={styles.filterLabel}>Radius</Text>
                <Text style={styles.radiusValue}>{locationDraft.radiusMiles} miles</Text>
              </View>
              <RadiusSlider
                value={locationDraft.radiusMiles}
                onChange={(radius) =>
                  setLocationDraft((prev) => ({
                    ...prev,
                    radiusMiles: radius,
                  }))
                }
              />
            </View>

            <View style={[styles.modalSection, styles.switchBlock]}>
              <Text style={styles.filterLabel}>Fulfillment</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Local meetups</Text>
                <Toggle
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
                <Toggle
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
                <Toggle
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
                <Text style={styles.secondaryButtonText}>Clear filters</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  isLocationDraftInvalid && styles.primaryButtonDisabled,
                ]}
                onPress={applyLocationFilter}
                disabled={isLocationDraftInvalid}
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
    paddingTop: 16,
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
    paddingHorizontal: 12,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: 16,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterLabel: {
    ...typography.caption,
    color: colors.text,
    marginTop: 6,
  },
  searchPanel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: "center",
    height: 44,
    width: 44,
  },
  locationButtonActive: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  locationSearchIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  resultCount: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 4,
  },
  searchModeText: {
    ...typography.caption,
    color: colors.muted,
  },
  footerState: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 72,
  },
  footerText: {
    ...typography.caption,
    color: colors.muted,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  modalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  modalSubtitle: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 3,
  },
  closeText: {
    ...typography.button,
    color: colors.primary,
    paddingVertical: 4,
  },
  locationLoader: {
    marginTop: 12,
  },
  locationOptions: {
    marginTop: 12,
    maxHeight: 190,
  },
  locationOption: {
    borderColor: colors.border,
    borderRadius: radii.control,
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
    ...typography.bodyStrong,
    color: colors.text,
  },
  locationOptionTextSelected: {
    color: colors.primary,
  },
  modalSection: {
    marginTop: 22,
  },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  radiusValue: {
    ...typography.caption,
    color: colors.muted,
  },
  radiusSliderBlock: {
    marginTop: 16,
  },
  radiusTrack: {
    height: 32,
    justifyContent: "center",
    marginHorizontal: 8,
  },
  radiusTrackRail: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    height: 4,
    left: 0,
    position: "absolute",
    right: 0,
    top: 14,
  },
  radiusTrackFill: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 4,
    left: 0,
    position: "absolute",
    top: 14,
  },
  radiusTick: {
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 8,
    marginLeft: -4,
    position: "absolute",
    top: 12,
    width: 8,
  },
  radiusTickActive: {
    backgroundColor: colors.primary,
  },
  radiusThumb: {
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 999,
    borderWidth: 3,
    height: 24,
    marginLeft: -12,
    position: "absolute",
    top: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: 24,
  },
  radiusLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  radiusLabel: {
    ...typography.caption,
    color: colors.muted,
    minWidth: 24,
    textAlign: "center",
  },
  radiusLabelActive: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily,
    fontWeight: "700",
  },
  switchBlock: {
    gap: 4,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  switchLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.text,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#fff",
  },
});
