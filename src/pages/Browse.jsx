import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Paper,
  Button,
  Stack,
  Divider,
  Autocomplete,
  Popover,
  Slider,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { Search, LocationOn } from "@mui/icons-material";
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
  getNormalizedFulfillmentFields,
  getPrimaryFulfillmentOption,
  isListingModerationHidden,
  isSoldListingPubliclyVisible,
  sortListingsByAvailabilityAndDate,
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
const LOCATION_FILTER_STORAGE_PREFIX = "wecube_browse_location_filter_v3";
const SOFT_PANEL_SX = {
  bgcolor: "#ffffff",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  boxShadow: "0 2px 10px rgba(31, 53, 99, 0.04)",
};
const LOCATION_FILTER_BUTTON_SX = {
  whiteSpace: "nowrap",
  minWidth: { xs: 44, sm: 64 },
  width: { xs: 44, sm: "auto" },
  maxWidth: { xs: 44, sm: 280 },
  px: { xs: 0, sm: 2 },
  color: "text.primary",
  borderColor: "rgba(148, 163, 184, 0.22)",
  "& .MuiButton-startIcon": {
    m: { xs: 0, sm: "0 8px 0 -4px" },
  },
  "&:hover": {
    borderColor: "primary.main",
    bgcolor: "rgba(47, 107, 255, 0.04)",
  },
  "&.MuiButton-contained": {
    color: "text.primary",
    border: "1px solid",
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

function getLocationButtonLabel(filters) {
  if (!filters.meetupLocation.trim()) {
    return "All locations";
  }

  return (
    filters.meetupLocationOption?.city ||
    filters.meetupLocation.split(",")[0].trim() ||
    "Location"
  );
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

  const normalizedListing = getNormalizedFulfillmentFields(listing);
  const competitionTags = [
    ...(normalizedListing.meetupCompetitionTags || []),
    ...(listing.competitions || []),
  ];
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
  const [listings, setListings] = useState([]);
  const [allListings, setAllListings] = useState([]); // For search/filter
  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [visibleCount, setVisibleCount] = useState(4);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    ...DEFAULT_LOCATION_FILTER,
  });
  const [locationDraft, setLocationDraft] = useState({
    ...DEFAULT_LOCATION_FILTER,
  });
  const [locationAnchorEl, setLocationAnchorEl] = useState(null);
  const [locationSearchOptions, setLocationSearchOptions] = useState([]);
  const [loadingLocationOptions, setLoadingLocationOptions] = useState(false);
  const [restoredLocationFilterKey, setRestoredLocationFilterKey] =
    useState(null);
  const navigate = useNavigate();
  const locationOptions =
    locationDraft.meetupLocation.trim().length >= 2 ? locationSearchOptions : [];
  const isLocationPopoverOpen = Boolean(locationAnchorEl);
  const hasLocationFilter = Boolean(filters.meetupLocation.trim());
  const isLocationDraftInvalid =
    Boolean(locationDraft.meetupLocation.trim()) &&
    !locationDraft.meetupLocationOption;
  const locationButtonLabel = getLocationButtonLabel(filters);
  const locationFilterStorageKey = getLocationFilterStorageKey(currentUser?.uid);

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
    setLocationDraft(storedLocationFilter);
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
    const query = locationDraft.meetupLocation.trim();
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
  }, [locationDraft.meetupLocation]);

  const applyFilters = useCallback(() => {
    const hasActiveFilter = Boolean(filters.search || filters.meetupLocation.trim());
    const sourceListings = hasActiveFilter ? allListings : listings;
    let filtered = sourceListings.filter(
      (listing) =>
        listing.userId === currentUser?.uid ||
        isSoldListingPubliclyVisible(listing)
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

    if (filters.meetupLocation.trim()) {
      filtered = filtered.filter((listing) => {
        const locationMatch = getLocationMatchInfo(listing, filters);
        return locationMatch.matchesLocation || locationMatch.matchesShipping;
      });
    }

    setFilteredListings(sortListingsByAvailabilityAndDate(filtered));
  }, [allListings, currentUser?.uid, filters, listings]);

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
    const sortedListings = sortListingsByAvailabilityAndDate(allListings);
    setListings(sortedListings.slice(0, visibleCount));
    setHasMore(sortedListings.length > visibleCount);
  }, [allListings, visibleCount]);

  // Check if user is actively searching/filtering
  useEffect(() => {
    const searching =
      filters.search ||
      hasLocationFilter;
    setIsSearching(searching);

  }, [filters, hasLocationFilter]);

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

  const clearLocationFilter = () => {
    setFilters((prev) => ({
      ...prev,
      ...DEFAULT_LOCATION_FILTER,
    }));
    setLocationDraft({ ...DEFAULT_LOCATION_FILTER });
  };

  const handleOpenLocationFilter = (event) => {
    setLocationDraft({
      meetupLocation: filters.meetupLocation,
      meetupLocationOption: filters.meetupLocationOption,
      meetupRadius: filters.meetupRadius,
      includeLocalMeetups: filters.includeLocalMeetups,
      includeCompetitionMeetups: filters.includeCompetitionMeetups,
      includeShippableListings: filters.includeShippableListings,
    });
    setLocationAnchorEl(event.currentTarget);
  };

  const handleApplyLocationFilter = () => {
    if (isLocationDraftInvalid) {
      return;
    }

    setFilters((prev) => ({
      ...prev,
      ...locationDraft,
    }));
    setLocationAnchorEl(null);
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
          message="Finding the newest cubes in the marketplace."
        />
      </Box>
    );
  }

  return (
    <Box sx={LISTING_PAGE_SX}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Browse Cubes
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
            <Button
              variant={hasLocationFilter ? "contained" : "outlined"}
              startIcon={<LocationOn />}
              onClick={handleOpenLocationFilter}
              aria-label={locationButtonLabel}
              sx={LOCATION_FILTER_BUTTON_SX}
            >
              <Box
                component="span"
                sx={{
                  display: { xs: "none", sm: "inline" },
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {locationButtonLabel}
              </Box>
            </Button>
          </Box>

          <Popover
            open={isLocationPopoverOpen}
            anchorEl={locationAnchorEl}
            onClose={() => setLocationAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{
              paper: {
                sx: {
                  width: { xs: "calc(100vw - 32px)", sm: 380 },
                  p: 2.5,
                  mt: 1,
                },
              },
            }}
          >
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Location
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Find listings available near this location.
                </Typography>
              </Box>

              <Autocomplete
                options={locationOptions}
                getOptionLabel={getLocationOptionLabel}
                isOptionEqualToValue={(option, value) =>
                  option?.label === value?.label
                }
                inputValue={locationDraft.meetupLocation}
                value={locationDraft.meetupLocationOption}
                loading={loadingLocationOptions}
                open={locationDraft.meetupLocation.trim().length >= 2}
                filterOptions={(options) => options}
                noOptionsText={
                  locationDraft.meetupLocation.trim().length < 2
                    ? "Start typing a location..."
                    : "No matching locations found"
                }
                onChange={(_, value) => {
                  const selectedLocation =
                    typeof value === "string" ? null : value;
                  setLocationDraft((prev) => ({
                    ...prev,
                    meetupLocation: getLocationOptionLabel(value),
                    meetupLocationOption: selectedLocation,
                  }));
                }}
                onInputChange={(_, value, reason) => {
                  if (reason === "reset") {
                    return;
                  }
                  setLocationDraft((prev) => ({
                    ...prev,
                    meetupLocation: value,
                    meetupLocationOption:
                      value === prev.meetupLocationOption?.label
                        ? prev.meetupLocationOption
                        : null,
                  }));
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
                  Radius: {locationDraft.meetupRadius} miles
                </Typography>
                <Slider
                  value={locationDraft.meetupRadius}
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
                    setLocationDraft((prev) => ({
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
                      checked={locationDraft.includeLocalMeetups}
                      onChange={(event) =>
                        setLocationDraft((prev) => ({
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
                      checked={locationDraft.includeCompetitionMeetups}
                      onChange={(event) =>
                        setLocationDraft((prev) => ({
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
                      checked={locationDraft.includeShippableListings}
                      onChange={(event) =>
                        setLocationDraft((prev) => ({
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
                <Button variant="text" onClick={clearLocationFilter}>
                  Clear location
                </Button>
                <Button
                  variant="contained"
                  onClick={handleApplyLocationFilter}
                  disabled={isLocationDraftInvalid}
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
        {filteredListings.map((listing) => (
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

      {/* Show total when searching */}
      {isSearching && (
        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Showing all results from {allListings.length} total cubes
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default Browse;
