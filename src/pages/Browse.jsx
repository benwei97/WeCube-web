import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Paper,
  Button,
  IconButton,
  Stack,
  Divider,
  Autocomplete,
  Popover,
  Slider,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from "@mui/material";
import { Search, Tune } from "@mui/icons-material";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import {
  LISTING_PAGE_SX,
  LISTING_CARD_CONTENT_SX,
  LISTING_CARD_GRID_SX,
  LISTING_CARD_PRICE_SX,
  LISTING_CARD_SX,
  LISTING_CARD_TEXT_STACK_SX,
  LISTING_CARD_TITLE_SX,
} from "../components/listingStatusStyles";
import {
  ListingCardMediaFrame,
} from "../components/ListingStatusDecorators";
import {
  formatListingPrice,
  getActiveFulfillmentFields,
  getListingTimestampMs,
  getNormalizedFulfillmentFields,
  getPrimaryFulfillmentOption,
  PUZZLE_TYPE_OPTIONS,
  isListingModerationHidden,
  isCompetitionOnlyListingExpired,
  isSoldListingPubliclyVisible,
  parseNonNegativeCurrencyAmount,
  sortListingsByAvailabilityAndDate,
  sortListingsByRecommended,
} from "../utils/listingUtils";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import { getS3PublicUrl } from "../utils/s3";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";
import PageState from "../components/PageState";

const EARTH_RADIUS_MILES = 3958.8;
const DEFAULT_LOCATION_RADIUS_MILES = 25;
const LOCATION_RADIUS_MIN_MILES = 5;
const LOCATION_RADIUS_MAX_MILES = 100;
const DEFAULT_LOCATION_FILTER = {
  meetupLocation: "",
  meetupLocationOption: null,
  meetupRadius: DEFAULT_LOCATION_RADIUS_MILES,
  includeLocalMeetups: true,
  includeCompetitionMeetups: true,
  includeShippableListings: true,
};
const DEFAULT_FILTER_PANEL = {
  sortMode: "recommended",
  puzzleType: "all",
  minPrice: "",
  maxPrice: "",
  ...DEFAULT_LOCATION_FILTER,
};
const DEFAULT_BROWSE_FILTERS = {
  search: "",
  ...DEFAULT_FILTER_PANEL,
};
const BROWSE_SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
];
const LOCATION_FILTER_STORAGE_PREFIX = "wecube_browse_location_filter_v3";
const SOFT_PANEL_SX = {
  bgcolor: "#ffffff",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  boxShadow: "0 2px 10px rgba(31, 53, 99, 0.04)",
};
const FILTER_BUTTON_SX = {
  width: 48,
  height: 48,
  flexShrink: 0,
  color: "text.primary",
  border: "1px solid",
  borderColor: "rgba(148, 163, 184, 0.22)",
  "&:hover": {
    borderColor: "primary.main",
    bgcolor: "rgba(47, 107, 255, 0.04)",
  },
  "&[data-active='true']": {
    color: "text.primary",
    borderColor: "primary.main",
    bgcolor: "rgba(47, 107, 255, 0.08)",
    boxShadow: "none",
    "&:hover": {
      borderColor: "primary.main",
      bgcolor: "rgba(47, 107, 255, 0.12)",
      boxShadow: "none",
    },
  },
};

function getLocationFilterStorageKey(userId) {
  return `${LOCATION_FILTER_STORAGE_PREFIX}_${userId || "guest"}`;
}

function sanitizeStoredLocationFilter(storedFilter) {
  if (!storedFilter || typeof storedFilter !== "object") {
    return { ...DEFAULT_LOCATION_FILTER };
  }

  const storedRadius = Number(storedFilter.meetupRadius);
  const meetupRadius =
    Number.isFinite(storedRadius) &&
    storedRadius >= LOCATION_RADIUS_MIN_MILES &&
    storedRadius <= LOCATION_RADIUS_MAX_MILES
      ? storedRadius
      : DEFAULT_LOCATION_RADIUS_MILES;

  return {
    meetupLocation:
      typeof storedFilter.meetupLocation === "string"
        ? storedFilter.meetupLocation
        : "",
    meetupLocationOption:
      storedFilter.meetupLocationOption &&
      typeof storedFilter.meetupLocationOption === "object"
        ? storedFilter.meetupLocationOption
        : null,
    meetupRadius,
    includeLocalMeetups:
      typeof storedFilter.includeLocalMeetups === "boolean"
        ? storedFilter.includeLocalMeetups
        : DEFAULT_LOCATION_FILTER.includeLocalMeetups,
    includeCompetitionMeetups:
      typeof storedFilter.includeCompetitionMeetups === "boolean"
        ? storedFilter.includeCompetitionMeetups
        : DEFAULT_LOCATION_FILTER.includeCompetitionMeetups,
    includeShippableListings:
      typeof storedFilter.includeShippableListings === "boolean"
        ? storedFilter.includeShippableListings
        : DEFAULT_LOCATION_FILTER.includeShippableListings,
  };
}

function readStoredLocationFilter(userId) {
  try {
    const rawFilter = window.localStorage.getItem(
      getLocationFilterStorageKey(userId)
    );
    return rawFilter
      ? sanitizeStoredLocationFilter(JSON.parse(rawFilter))
      : { ...DEFAULT_LOCATION_FILTER };
  } catch (error) {
    console.warn("Unable to read saved location filter:", error);
    return { ...DEFAULT_LOCATION_FILTER };
  }
}

function writeStoredLocationFilter(userId, locationFilter) {
  try {
    window.localStorage.setItem(
      getLocationFilterStorageKey(userId),
      JSON.stringify(sanitizeStoredLocationFilter(locationFilter))
    );
  } catch (error) {
    console.warn("Unable to save location filter:", error);
  }
}

function getMilesBetweenLocations(origin, destination) {
  if (
    typeof origin?.latitude !== "number" ||
    typeof origin?.longitude !== "number" ||
    typeof destination?.latitude !== "number" ||
    typeof destination?.longitude !== "number"
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const originLat = toRadians(origin.latitude);
  const destinationLat = toRadians(destination.latitude);
  const latDelta = toRadians(destination.latitude - origin.latitude);
  const lonDelta = toRadians(destination.longitude - origin.longitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(lonDelta / 2) ** 2;

  return (
    EARTH_RADIUS_MILES *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function getPriceAmount(price) {
  const amount = Number(price);
  return Number.isFinite(amount) ? amount : null;
}

function getFilterCount(filters) {
  return [
    filters.sortMode !== "recommended",
    filters.meetupLocation.trim(),
    filters.puzzleType !== "all",
    filters.minPrice.trim() || filters.maxPrice.trim(),
  ].filter(Boolean).length;
}

function getBrowseAvailabilityRank(listing = {}) {
  if (listing.status === "sold") {
    return 2;
  }

  if (listing.status === "archived") {
    return 1;
  }

  return 0;
}

function sortBrowseListings(listings = [], sortMode = "recommended") {
  if (sortMode === "newest") {
    return sortListingsByAvailabilityAndDate(listings);
  }

  if (sortMode === "price-low" || sortMode === "price-high") {
    const direction = sortMode === "price-low" ? 1 : -1;
    return [...listings].sort((a, b) => {
      const availabilityDelta =
        getBrowseAvailabilityRank(a) - getBrowseAvailabilityRank(b);

      if (availabilityDelta !== 0) {
        return availabilityDelta;
      }

      const aPrice = getPriceAmount(a.price);
      const bPrice = getPriceAmount(b.price);

      if (aPrice === null && bPrice === null) {
        return 0;
      }

      if (aPrice === null) {
        return 1;
      }

      if (bPrice === null) {
        return -1;
      }

      if (aPrice !== bPrice) {
        return (aPrice - bPrice) * direction;
      }

      return getListingTimestampMs(b.createdAt) - getListingTimestampMs(a.createdAt);
    });
  }

  return sortListingsByRecommended(listings);
}

function getLocationMatchInfo(listing, filters) {
  if (!filters.meetupLocation.trim()) {
    return {
      matchesLocation: false,
      matchesLocalMeetup: false,
      matchingCompetition: null,
      matchesShipping: false,
    };
  }

  const normalizedListing = getActiveFulfillmentFields(listing);
  const competitionTags = normalizedListing.meetupCompetitionTags || [];
  const meetupLocationSearch = filters.meetupLocation.trim().toLowerCase();
  const selectedLocation = filters.meetupLocationOption;
  const selectedRadius = Number(filters.meetupRadius);
  const canFilterByRadius =
    Number.isFinite(selectedRadius) &&
    selectedRadius > 0 &&
    typeof selectedLocation?.latitude === "number" &&
    typeof selectedLocation?.longitude === "number";

  const exactMeetupTextMatch = [
    normalizedListing.meetupLocationLabel,
    listing.meetupLocation?.city,
    listing.meetupLocation?.region,
    listing.meetupLocation?.country,
    ...competitionTags.flatMap((competition) => [
      competition.city,
      competition.country,
    ]),
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase() === meetupLocationSearch);

  let matchesLocalMeetup = false;
  let matchingCompetition = null;

  if (canFilterByRadius) {
    const localMeetupDistance = getMilesBetweenLocations(
      selectedLocation,
      listing.meetupLocation
    );
    matchesLocalMeetup =
      filters.includeLocalMeetups &&
      normalizedListing.localMeetupAvailable &&
      localMeetupDistance !== null &&
      localMeetupDistance <= selectedRadius;
    matchingCompetition =
      filters.includeCompetitionMeetups && normalizedListing.competitionMeetupAvailable
        ? competitionTags.find((location) => {
            const distance = getMilesBetweenLocations(selectedLocation, location);
            return distance !== null && distance <= selectedRadius;
          }) || null
        : null;
    const legacyTextMatch =
      exactMeetupTextMatch &&
      ((filters.includeLocalMeetups && normalizedListing.localMeetupAvailable) ||
        (filters.includeCompetitionMeetups &&
          normalizedListing.competitionMeetupAvailable));

    if (legacyTextMatch && !matchesLocalMeetup && !matchingCompetition) {
      if (filters.includeLocalMeetups && normalizedListing.localMeetupAvailable) {
        matchesLocalMeetup = true;
      } else if (
        filters.includeCompetitionMeetups &&
        normalizedListing.competitionMeetupAvailable
      ) {
        matchingCompetition = competitionTags[0] || {
          name: "Competition meetup",
        };
      }
    }
  } else {
    const searchableMeetupText = [
      normalizedListing.meetupLocationLabel,
      listing.meetupLocation?.city,
      listing.meetupLocation?.region,
      listing.meetupLocation?.country,
      ...competitionTags.flatMap((competition) => [
        competition.city,
        competition.country,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    matchesLocalMeetup =
      filters.includeLocalMeetups &&
      normalizedListing.localMeetupAvailable &&
      searchableMeetupText.includes(meetupLocationSearch);
    matchingCompetition =
      filters.includeCompetitionMeetups && normalizedListing.competitionMeetupAvailable
        ? competitionTags.find((competition) =>
            [competition.city, competition.country]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(meetupLocationSearch)
          ) || null
        : null;
  }

  return {
    matchesLocation: matchesLocalMeetup || Boolean(matchingCompetition),
    matchesLocalMeetup,
    matchingCompetition,
    matchesShipping:
      filters.includeShippableListings && normalizedListing.shippingAvailable,
  };
}

function getCompetitionFulfillmentOption(competition = {}) {
  return {
    type: "competition",
    label: competition.displayName || competition.name || "Competition meetup",
  };
}

function Browse() {
  const { currentUser } = useAuth();
  const [allListings, setAllListings] = useState([]); // For search/filter
  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [visibleCount, setVisibleCount] = useState(4);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState({ ...DEFAULT_BROWSE_FILTERS });
  const [filterDraft, setFilterDraft] = useState({ ...DEFAULT_FILTER_PANEL });
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [locationSearchOptions, setLocationSearchOptions] = useState([]);
  const [loadingLocationOptions, setLoadingLocationOptions] = useState(false);
  const [isLocationAutocompleteOpen, setIsLocationAutocompleteOpen] =
    useState(false);
  const [restoredLocationFilterKey, setRestoredLocationFilterKey] =
    useState(null);
  const navigate = useNavigate();
  const locationOptions =
    filterDraft.meetupLocation.trim().length >= 2 ? locationSearchOptions : [];
  const isFilterPopoverOpen = Boolean(filterAnchorEl);
  const hasLocationFilter = Boolean(filters.meetupLocation.trim());
  const hasPuzzleTypeFilter = filters.puzzleType !== "all";
  const hasPriceRangeFilter = Boolean(
    filters.minPrice.trim() || filters.maxPrice.trim()
  );
  const activeFilterCount = getFilterCount(filters);
  const hasPanelFilters = activeFilterCount > 0;
  const hasActiveFilters = Boolean(
    filters.search ||
      hasPanelFilters
  );
  const isFilterDraftInvalid =
    Boolean(filterDraft.meetupLocation.trim()) &&
    !filterDraft.meetupLocationOption;
  const locationFilterStorageKey = getLocationFilterStorageKey(currentUser?.uid);
  const displayedListings = isSearching
    ? filteredListings
    : filteredListings.slice(0, visibleCount);

  useEffect(() => {
    const listingsQuery = query(
      collection(db, "listings"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (listingsSnapshot) => {
        const listingsData = listingsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })).filter((listing) => !isListingModerationHidden(listing));

        setAllListings(listingsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to listings:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const storedLocationFilter = readStoredLocationFilter(currentUser?.uid);
    setFilters((prev) => ({
      ...prev,
      ...storedLocationFilter,
    }));
    setFilterDraft((prev) => ({
      ...prev,
      ...storedLocationFilter,
    }));
    setRestoredLocationFilterKey(locationFilterStorageKey);
  }, [currentUser?.uid, locationFilterStorageKey]);

  useEffect(() => {
    if (restoredLocationFilterKey !== locationFilterStorageKey) {
      return;
    }

    writeStoredLocationFilter(currentUser?.uid, {
      meetupLocation: filters.meetupLocation,
      meetupLocationOption: filters.meetupLocationOption,
      meetupRadius: filters.meetupRadius,
      includeLocalMeetups: filters.includeLocalMeetups,
      includeCompetitionMeetups: filters.includeCompetitionMeetups,
      includeShippableListings: filters.includeShippableListings,
    });
  }, [
    currentUser?.uid,
    filters.meetupLocation,
    filters.meetupLocationOption,
    filters.meetupRadius,
    filters.includeLocalMeetups,
    filters.includeCompetitionMeetups,
    filters.includeShippableListings,
    locationFilterStorageKey,
    restoredLocationFilterKey,
  ]);

  useEffect(() => {
    const query = filterDraft.meetupLocation.trim();
    if (query.length < 2) {
      setLocationSearchOptions([]);
      setLoadingLocationOptions(false);
      return undefined;
    }

    let active = true;
    setLoadingLocationOptions(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const suggestions = await fetchLocationSuggestionOptions(query);
        if (active) {
          setLocationSearchOptions(suggestions);
        }
      } catch (error) {
        console.error("Error loading location filter suggestions:", error);
        if (active) {
          setLocationSearchOptions([]);
        }
      } finally {
        if (active) {
          setLoadingLocationOptions(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [filterDraft.meetupLocation]);

  const applyFilters = useCallback(() => {
    let filtered = allListings.filter(
      (listing) =>
        listing.userId === currentUser?.uid ||
        (isSoldListingPubliclyVisible(listing) &&
          !isCompetitionOnlyListingExpired(listing))
    );

    if (filters.search) {
      filtered = filtered.filter(
        (listing) =>
          listing.title.toLowerCase().includes(filters.search.toLowerCase()) ||
          listing.description
            ?.toLowerCase()
            .includes(filters.search.toLowerCase())
      );
    }

    if (hasPuzzleTypeFilter) {
      filtered = filtered.filter(
        (listing) => listing.puzzleType === filters.puzzleType
      );
    }

    if (hasPriceRangeFilter) {
      const minPrice = parseNonNegativeCurrencyAmount(filters.minPrice);
      const maxPrice = parseNonNegativeCurrencyAmount(filters.maxPrice);

      filtered = filtered.filter((listing) => {
        const listingPrice = getPriceAmount(listing.price);

        if (listingPrice === null) {
          return false;
        }

        if (minPrice !== null && listingPrice < minPrice) {
          return false;
        }

        if (maxPrice !== null && listingPrice > maxPrice) {
          return false;
        }

        return true;
      });
    }

    if (filters.meetupLocation.trim()) {
      filtered = filtered.filter((listing) => {
        const locationMatch = getLocationMatchInfo(listing, filters);
        return locationMatch.matchesLocation || locationMatch.matchesShipping;
      });
    }

    setFilteredListings(sortBrowseListings(filtered, filters.sortMode));
  }, [
    allListings,
    currentUser?.uid,
    filters,
    hasPriceRangeFilter,
    hasPuzzleTypeFilter,
  ]);

  const loadMoreListings = useCallback(() => {
    if (!isSearching && hasMore && !loadingMore) {
      setLoadingMore(true);
      window.setTimeout(() => {
        setVisibleCount((prev) => prev + 8);
        setLoadingMore(false);
      }, 120);
    }
  }, [hasMore, isSearching, loadingMore]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters, isSearching]);

  useEffect(() => {
    setHasMore(!isSearching && filteredListings.length > visibleCount);
  }, [filteredListings.length, isSearching, visibleCount]);

  // Check if user is actively searching/filtering
  useEffect(() => {
    setIsSearching(hasActiveFilters);
  }, [hasActiveFilters]);

  useEffect(() => {
    if (isSearching || !hasMore || loading) {
      return undefined;
    }

    const handleScroll = () => {
      if (loadingMore) {
        return;
      }

      const scrollPosition = window.innerHeight + window.scrollY;
      const pageBottom = document.documentElement.scrollHeight;

      if (pageBottom - scrollPosition < 900) {
        loadMoreListings();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, isSearching, loading, loadingMore, loadMoreListings]);

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }));
  };

  const clearPanelFilters = () => {
    setFilters((prev) => ({
      ...prev,
      ...DEFAULT_FILTER_PANEL,
    }));
    setFilterDraft({ ...DEFAULT_FILTER_PANEL });
    setIsLocationAutocompleteOpen(false);
  };

  const handleOpenFilter = (event) => {
    setFilterDraft({
      sortMode: filters.sortMode,
      puzzleType: filters.puzzleType,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      meetupLocation: filters.meetupLocation,
      meetupLocationOption: filters.meetupLocationOption,
      meetupRadius: filters.meetupRadius,
      includeLocalMeetups: filters.includeLocalMeetups,
      includeCompetitionMeetups: filters.includeCompetitionMeetups,
      includeShippableListings: filters.includeShippableListings,
    });
    setIsLocationAutocompleteOpen(false);
    setFilterAnchorEl(event.currentTarget);
  };

  const handleCloseFilter = () => {
    setIsLocationAutocompleteOpen(false);
    setFilterAnchorEl(null);
  };

  const handleApplyFilterPanel = () => {
    if (isFilterDraftInvalid) {
      return;
    }

    setFilters((prev) => ({
      ...prev,
      ...filterDraft,
    }));
    handleCloseFilter();
  };

  const formatPrice = formatListingPrice;

  const handleListingClick = (listingId) => {
    navigate(`/listing/${listingId}`);
  };

  if (loading) {
    return (
      <Box sx={LISTING_PAGE_SX}>
        <PageState
          variant="loading"
          title="Loading listings"
        />
      </Box>
    );
  }

  return (
    <Box sx={LISTING_PAGE_SX}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Browse Cubes
      </Typography>
      <Typography
        variant="body2"
        color="primary"
        sx={{ mt: -0.5, mb: 2.5, fontWeight: 700 }}
      >
        iOS app coming soon!
      </Typography>

      {/* Search and Filter Bar */}
      <Paper sx={{ p: 2, mb: 3, ...SOFT_PANEL_SX }}>
        <Stack spacing={2}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <TextField
              placeholder="Search cubes..."
              variant="outlined"
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <Search sx={{ mr: 1, color: "text.secondary" }} />
                  ),
                },
              }}
            />
            <IconButton
              onClick={handleOpenFilter}
              aria-label={
                activeFilterCount > 0
                  ? `${activeFilterCount} active filters`
                  : "Filters"
              }
              data-active={hasPanelFilters ? "true" : "false"}
              sx={FILTER_BUTTON_SX}
            >
              <Tune />
            </IconButton>
          </Box>

          <Popover
            open={isFilterPopoverOpen}
            anchorEl={filterAnchorEl}
            onClose={handleCloseFilter}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{
              paper: {
                sx: {
                  width: { xs: "calc(100vw - 32px)", sm: 420 },
                  p: 2.5,
                  mt: 1,
                },
              },
            }}
          >
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Filters
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Leave location blank to include listings from everywhere.
                </Typography>
              </Box>

              <FormControl size="small" fullWidth>
                <InputLabel id="browse-sort-label">Sort by</InputLabel>
                <Select
                  labelId="browse-sort-label"
                  value={filterDraft.sortMode}
                  label="Sort by"
                  onChange={(event) =>
                    setFilterDraft((prev) => ({
                      ...prev,
                      sortMode: event.target.value,
                    }))
                  }
                >
                  {BROWSE_SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="puzzle-type-filter-label">Puzzle type</InputLabel>
                <Select
                  labelId="puzzle-type-filter-label"
                  value={filterDraft.puzzleType}
                  label="Puzzle type"
                  onChange={(event) =>
                    setFilterDraft((prev) => ({
                      ...prev,
                      puzzleType: event.target.value,
                    }))
                  }
                >
                  <MenuItem value="all">All puzzle types</MenuItem>
                  {PUZZLE_TYPE_OPTIONS.map((puzzleType) => (
                    <MenuItem key={puzzleType} value={puzzleType}>
                      {puzzleType}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Min price"
                  type="number"
                  value={filterDraft.minPrice}
                  onChange={(event) =>
                    setFilterDraft((prev) => ({
                      ...prev,
                      minPrice: event.target.value,
                    }))
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                      inputProps: { min: 0, step: "0.01" },
                    },
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Max price"
                  type="number"
                  value={filterDraft.maxPrice}
                  onChange={(event) =>
                    setFilterDraft((prev) => ({
                      ...prev,
                      maxPrice: event.target.value,
                    }))
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                      inputProps: { min: 0, step: "0.01" },
                    },
                  }}
                  sx={{ flex: 1 }}
                />
              </Stack>

              <Divider />

              <Autocomplete
                options={locationOptions}
                getOptionLabel={getLocationOptionLabel}
                isOptionEqualToValue={(option, value) =>
                  option?.label === value?.label
                }
                inputValue={filterDraft.meetupLocation}
                value={filterDraft.meetupLocationOption}
                loading={loadingLocationOptions}
                open={
                  isLocationAutocompleteOpen &&
                  filterDraft.meetupLocation.trim().length >= 2
                }
                onOpen={() => {
                  if (!filterDraft.meetupLocationOption) {
                    setIsLocationAutocompleteOpen(true);
                  }
                }}
                onClose={() => setIsLocationAutocompleteOpen(false)}
                filterOptions={(options) => options}
                noOptionsText={
                  filterDraft.meetupLocation.trim().length < 2
                    ? "Start typing a location..."
                    : "No matching locations found"
                }
                onChange={(_, value) => {
                  const selectedLocation =
                    typeof value === "string" ? null : value;
                  setFilterDraft((prev) => ({
                    ...prev,
                    meetupLocation: getLocationOptionLabel(value),
                    meetupLocationOption: selectedLocation,
                  }));
                  setIsLocationAutocompleteOpen(false);
                }}
                onInputChange={(_, value, reason) => {
                  if (reason === "reset") {
                    return;
                  }
                  setFilterDraft((prev) => ({
                    ...prev,
                    meetupLocation: value,
                    meetupLocationOption:
                      value === prev.meetupLocationOption?.label
                        ? prev.meetupLocationOption
                        : null,
                  }));
                  setIsLocationAutocompleteOpen(value.trim().length >= 2);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search location"
                    inputProps={{
                      ...params.inputProps,
                      "aria-label": "Search location",
                    }}
                  />
                )}
              />

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Radius: {filterDraft.meetupRadius} miles
                </Typography>
                <Slider
                  value={filterDraft.meetupRadius}
                  min={LOCATION_RADIUS_MIN_MILES}
                  max={LOCATION_RADIUS_MAX_MILES}
                  step={5}
                  marks={[
                    { value: LOCATION_RADIUS_MIN_MILES, label: "5" },
                    { value: DEFAULT_LOCATION_RADIUS_MILES, label: "25" },
                    { value: 50, label: "50" },
                    { value: LOCATION_RADIUS_MAX_MILES, label: "100" },
                  ]}
                  valueLabelDisplay="auto"
                  onChange={(_, value) =>
                    setFilterDraft((prev) => ({
                      ...prev,
                      meetupRadius: value,
                    }))
                  }
                />
              </Box>

              <Divider />

              <Stack spacing={0.5}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={filterDraft.includeLocalMeetups}
                      onChange={(event) =>
                        setFilterDraft((prev) => ({
                          ...prev,
                          includeLocalMeetups: event.target.checked,
                        }))
                      }
                    />
                  }
                  label="Local meetups"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={filterDraft.includeCompetitionMeetups}
                      onChange={(event) =>
                        setFilterDraft((prev) => ({
                          ...prev,
                          includeCompetitionMeetups: event.target.checked,
                        }))
                      }
                    />
                  }
                  label="Competition meetups"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={filterDraft.includeShippableListings}
                      onChange={(event) =>
                        setFilterDraft((prev) => ({
                          ...prev,
                          includeShippableListings: event.target.checked,
                        }))
                      }
                    />
                  }
                  label="Shippable listings"
                />
              </Stack>

              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Button variant="text" onClick={clearPanelFilters}>
                  Clear filters
                </Button>
                <Button
                  variant="contained"
                  onClick={handleApplyFilterPanel}
                  disabled={isFilterDraftInvalid}
                >
                  Apply
                </Button>
              </Stack>
            </Stack>
          </Popover>
        </Stack>
      </Paper>

      {/* Results Count */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {filteredListings.length}{" "}
        {filteredListings.length === 1 ? "cube" : "cubes"} found
      </Typography>

      {/* Listings Grid */}
      <Box sx={LISTING_CARD_GRID_SX}>
        {displayedListings.map((listing) => (
          <Box key={listing.id}>
            {(() => {
              const normalizedListing = {
                  ...listing,
                  ...getNormalizedFulfillmentFields(listing),
                };
              const locationMatch = getLocationMatchInfo(listing, filters);
              const fulfillmentOption =
                hasLocationFilter &&
                locationMatch.matchingCompetition &&
                !locationMatch.matchesLocalMeetup
                  ? getCompetitionFulfillmentOption(
                      locationMatch.matchingCompetition
                    )
                  : getPrimaryFulfillmentOption(normalizedListing, {
                      preferShipping:
                        hasLocationFilter &&
                        locationMatch.matchesShipping &&
                        !locationMatch.matchesLocation,
                    });

              return (
            <Card
              sx={{
                ...LISTING_CARD_SX,
                cursor: "pointer",
                "&:hover": {
                  transform: "translateY(-2px)",
                },
              }}
              onClick={() => handleListingClick(listing.id)}
            >
              <ListingCardMediaFrame
                imageUrl={
                  listing.photos?.[0]
                    ? getS3PublicUrl(listing.photos[0].s3Key)
                    : null
                }
                alt={listing.title}
                isSold={listing.status === "sold"}
                isPending={listing.status === "archived"}
                imageSx={{ objectFit: "cover" }}
                placeholderSx={{
                  backgroundColor: "grey.200",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              />

              <CardContent
                sx={{
                  ...LISTING_CARD_CONTENT_SX,
                }}
              >
                <Box sx={LISTING_CARD_TEXT_STACK_SX}>
                  <Typography
                    variant="h6"
                    sx={{
                      ...LISTING_CARD_TITLE_SX,
                      color: listing.status === "sold" ? "text.primary" : "inherit",
                    }}
                  >
                    {listing.title}
                  </Typography>

                  <Typography
                    variant="h5"
                    color="text.primary"
                    fontWeight={600}
                    sx={LISTING_CARD_PRICE_SX}
                  >
                    {formatPrice(listing.price)}
                  </Typography>
                  <ListingFulfillmentLine option={fulfillmentOption} />
                </Box>
              </CardContent>
            </Card>
              );
            })()}
          </Box>
        ))}
      </Box>

      {filteredListings.length === 0 && !loading && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No cubes found matching your criteria
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Try adjusting your filters or search terms
          </Typography>
        </Box>
      )}

      {!isSearching && filteredListings.length > 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 72,
            mt: 3,
          }}
        >
          {(loadingMore || hasMore) && (
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{ color: "text.secondary" }}
            >
              <CircularProgress size={18} thickness={5} />
              <Typography
                variant="body2"
                sx={{
                  opacity: loadingMore ? 1 : 0.72,
                  transition: "opacity 0.2s ease",
                }}
              >
                {loadingMore ? "Loading more cubes..." : "Scroll for more"}
              </Typography>
            </Stack>
          )}
        </Box>
      )}

    </Box>
  );
}

export default Browse;
