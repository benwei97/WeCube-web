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
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  LISTING_CARD_CONTENT_SX,
  LISTING_CARD_GRID_SX,
  LISTING_CARD_SX,
  LISTING_CARD_TEXT_STACK_SX,
  LISTING_CARD_TITLE_SX,
  ListingCardMediaFrame,
} from "../components/ListingStatusDecorators";
import {
  getNormalizedFulfillmentFields,
  getShippingPriceFromListing,
  isSoldListingPubliclyVisible,
  sortListingsByAvailabilityAndDate,
} from "../utils/listingUtils";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";

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
  const navigate = useNavigate();
  const attendingCompetitionIds = new Set(
    (currentUser?.attendingCompetitions || []).map((competition) => competition.id)
  );
  const locationOptions =
    locationDraft.meetupLocation.trim().length >= 2 ? locationSearchOptions : [];
  const isLocationPopoverOpen = Boolean(locationAnchorEl);
  const hasLocationFilter = Boolean(filters.meetupLocation.trim());
  const locationButtonLabel = getLocationButtonLabel(filters);

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
        }));

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

  useEffect(() => {
    applyFilters();
  }, [listings, allListings, filters, currentUser, isSearching]);

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

  const loadMoreListings = () => {
    if (!isSearching && hasMore && !loadingMore) {
      setLoadingMore(true);
      window.setTimeout(() => {
        setVisibleCount((prev) => prev + 8);
        setLoadingMore(false);
      }, 120);
    }
  };

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
  }, [hasMore, isSearching, loading, loadingMore]);

  const applyFilters = () => {
    // Use allListings for search/filter, listings for pagination
    const sourceListings = isSearching ? allListings : listings;
    let filtered = sourceListings.filter(
      (listing) =>
        listing.userId === currentUser?.uid ||
        (listing.status !== "archived" && isSoldListingPubliclyVisible(listing))
    );

    // Search filter
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
      const meetupLocationSearch = filters.meetupLocation.trim().toLowerCase();
      const selectedLocation = filters.meetupLocationOption;
      const selectedRadius = Number(filters.meetupRadius);
      const canFilterByRadius =
        Number.isFinite(selectedRadius) &&
        selectedRadius > 0 &&
        typeof selectedLocation?.latitude === "number" &&
        typeof selectedLocation?.longitude === "number";

      filtered = filtered.filter((listing) => {
        const normalizedListing = getNormalizedFulfillmentFields(listing);
        const competitionTags = [
          ...(normalizedListing.meetupCompetitionTags || []),
          ...(listing.competitions || []),
        ];

        if (filters.includeShippableListings && normalizedListing.shippingAvailable) {
          return true;
        }

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

        if (canFilterByRadius) {
          const localMeetupMatches =
            filters.includeLocalMeetups &&
            normalizedListing.localMeetupAvailable &&
            getMilesBetweenLocations(selectedLocation, listing.meetupLocation) !==
              null &&
            getMilesBetweenLocations(selectedLocation, listing.meetupLocation) <=
              selectedRadius;
          const competitionMeetupMatches =
            filters.includeCompetitionMeetups &&
            normalizedListing.competitionMeetupAvailable &&
            competitionTags
              .map((location) =>
                getMilesBetweenLocations(selectedLocation, location)
              )
              .filter((distance) => distance !== null)
              .some((distance) => distance <= selectedRadius);
          const legacyTextMatch =
            exactMeetupTextMatch &&
            ((filters.includeLocalMeetups &&
              normalizedListing.localMeetupAvailable) ||
              (filters.includeCompetitionMeetups &&
                normalizedListing.competitionMeetupAvailable));

          return localMeetupMatches || competitionMeetupMatches || legacyTextMatch;
        }

        const localTextMatch =
          filters.includeLocalMeetups &&
          normalizedListing.localMeetupAvailable &&
          searchableMeetupText.includes(meetupLocationSearch);
        const competitionTextMatch =
          filters.includeCompetitionMeetups &&
          normalizedListing.competitionMeetupAvailable &&
          competitionTags
            .flatMap((competition) => [competition.city, competition.country])
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(meetupLocationSearch);

        return localTextMatch || competitionTextMatch;
      });
    }

    setFilteredListings(sortListingsByAvailabilityAndDate(filtered));
  };

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

  const handleApplyLocationFilter = async () => {
    let nextLocationDraft = locationDraft;
    const locationLabel = locationDraft.meetupLocation.trim();

    if (locationLabel && !locationDraft.meetupLocationOption) {
      try {
        const [suggestion] = await fetchLocationSuggestionOptions(locationLabel);
        if (suggestion) {
          nextLocationDraft = {
            ...locationDraft,
            meetupLocation: suggestion.label,
            meetupLocationOption: suggestion,
          };
          setLocationDraft(nextLocationDraft);
        }
      } catch (error) {
        console.error("Error resolving location filter:", error);
      }
    }

    setFilters((prev) => ({
      ...prev,
      ...nextLocationDraft,
    }));
    setLocationAnchorEl(null);
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  const handleListingClick = (listingId) => {
    navigate(`/listing/${listingId}`);
  };

  if (loading) {
    return (
      <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h4">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Browse Cubes
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Discover amazing cubes from the community
      </Typography>

      {/* Search and Filter Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
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
              sx={{ whiteSpace: "nowrap", maxWidth: { xs: 160, sm: 280 } }}
            >
              <Box
                component="span"
                sx={{
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
                freeSolo
                options={locationOptions}
                getOptionLabel={getLocationOptionLabel}
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
                    label="Search location"
                    placeholder="City, region, or country"
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
              const shippingPrice = getShippingPriceFromListing(normalizedListing);
              const hasCompetitionMatch = normalizedListing.meetupCompetitionTags?.some(
                (competition) => attendingCompetitionIds.has(competition.id)
              );

              return (
            <Card
              sx={{
                ...LISTING_CARD_SX,
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: 3,
                },
              }}
              onClick={() => handleListingClick(listing.id)}
            >
              <ListingCardMediaFrame
                imageUrl={
                  listing.photos?.[0]
                    ? `https://wecube.s3.us-east-1.amazonaws.com/${listing.photos[0].s3Key}`
                    : null
                }
                alt={listing.title}
                isSold={listing.status === "sold"}
                imageSx={{ objectFit: "cover" }}
                placeholderSx={{
                  backgroundColor: "grey.200",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                topLeftAdornment={
                  normalizedListing.competitionMeetupAvailable ? (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: hasCompetitionMatch
                          ? "success.main"
                          : "rgba(255,255,255,0.92)",
                        border: "1px solid",
                        borderColor: hasCompetitionMatch
                          ? "success.dark"
                          : "divider",
                        color: hasCompetitionMatch
                          ? "common.white"
                          : "text.secondary",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        zIndex: 1,
                      }}
                      aria-label={
                        hasCompetitionMatch
                          ? "Available at a competition you are attending"
                          : "Available at competition"
                      }
                      title={
                        hasCompetitionMatch
                          ? "Available at a competition you are attending"
                          : "Available at competition"
                      }
                    >
                      C
                    </Box>
                  ) : null
                }
              />

              <CardContent
                sx={{
                  ...LISTING_CARD_CONTENT_SX,
                  px: 3,
                  pb: 3,
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
                    color="primary"
                    fontWeight="bold"
                    sx={{ mb: 0, lineHeight: 1.1 }}
                  >
                    {formatPrice(listing.price)}
                  </Typography>
                  {normalizedListing.shippingAvailable && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: normalizedListing.shippingIncluded
                        ? "success.main"
                        : "text.secondary",
                      fontWeight: 500,
                      lineHeight: 1.12,
                    }}
                  >
                      {normalizedListing.shippingIncluded
                        ? "Free shipping"
                        : shippingPrice > 0
                          ? `+ ${formatPrice(shippingPrice)} shipping`
                          : "Shipping available"}
                    </Typography>
                  )}
                  {normalizedListing.meetupLocationLabel &&
                    normalizedListing.localMeetupAvailable && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: "auto",
                          lineHeight: 1.18,
                          opacity: 0.9,
                        }}
                      >
                        {normalizedListing.meetupLocationLabel}
                      </Typography>
                    )}
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
