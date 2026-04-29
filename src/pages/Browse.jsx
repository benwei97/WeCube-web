import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Paper,
  Button,
  Stack,
  Divider,
} from "@mui/material";
import { Search, FilterList } from "@mui/icons-material";
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
} from "../utils/listingUtils";

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
    condition: "",
    priceRange: [0, 1000],
    deliveryOption: "",
  });
  const [maxPrice, setMaxPrice] = useState(1000);
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();
  const attendingCompetitionIds = new Set(
    (currentUser?.attendingCompetitions || []).map((competition) => competition.id)
  );

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
    applyFilters();
  }, [listings, allListings, filters, currentUser, isSearching]);

  useEffect(() => {
    setListings(allListings.slice(0, visibleCount));
    setHasMore(allListings.length > visibleCount);
  }, [allListings, visibleCount]);

  useEffect(() => {
    const prices = allListings
      .map((listing) => listing.price)
      .filter((price) => price && !isNaN(price));
    const calculatedMaxPrice = prices.length > 0 ? Math.max(...prices) : 1000;
    const roundedMaxPrice = Math.ceil(calculatedMaxPrice / 10) * 10;

    setMaxPrice(roundedMaxPrice);
    setFilters((prev) => {
      const [minPrice, maxSelectedPrice] = prev.priceRange;

      return {
        ...prev,
        priceRange: [
          Math.min(minPrice, roundedMaxPrice),
          Math.min(maxSelectedPrice, roundedMaxPrice) || roundedMaxPrice,
        ],
      };
    });
  }, [allListings]);

  // Check if user is actively searching/filtering
  useEffect(() => {
    const searching =
      filters.search ||
      filters.condition ||
      filters.priceRange[0] > 0 ||
      filters.priceRange[1] < maxPrice ||
      filters.deliveryOption;
    setIsSearching(searching);

  }, [filters, maxPrice]);

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

    // Condition filter
    if (filters.condition) {
      filtered = filtered.filter(
        (listing) => listing.condition === filters.condition
      );
    }

    // Price range filter
    filtered = filtered.filter((listing) => {
      return (
        listing.price >= filters.priceRange[0] &&
        listing.price <= filters.priceRange[1]
      );
    });

    // Delivery option filter
    if (filters.deliveryOption) {
      filtered = filtered.filter((listing) => {
        const normalizedListing = getNormalizedFulfillmentFields(listing);
        if (filters.deliveryOption === "shipping") {
          return normalizedListing.shippingAvailable;
        }
        if (filters.deliveryOption === "meetup") {
          return (
            normalizedListing.localMeetupAvailable ||
            normalizedListing.competitionMeetupAvailable
          );
        }
        return true;
      });
    }

    setFilteredListings(filtered);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      condition: "",
      priceRange: [0, maxPrice],
      deliveryOption: "",
    });
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
              variant="outlined"
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
            >
              Filters
            </Button>
          </Box>

          {showFilters && (
            <>
              <Divider />
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>Condition</InputLabel>
                  <Select
                    value={filters.condition}
                    label="Condition"
                    onChange={(e) =>
                      handleFilterChange("condition", e.target.value)
                    }
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="new">New</MenuItem>
                    <MenuItem value="like-new">Like New</MenuItem>
                    <MenuItem value="excellent">Excellent</MenuItem>
                    <MenuItem value="good">Good</MenuItem>
                    <MenuItem value="fair">Fair</MenuItem>
                    <MenuItem value="used">Used</MenuItem>
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>Delivery</InputLabel>
                  <Select
                    value={filters.deliveryOption}
                    label="Delivery"
                    onChange={(e) =>
                      handleFilterChange("deliveryOption", e.target.value)
                    }
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="shipping">Shipping</MenuItem>
                    <MenuItem value="meetup">Meetup</MenuItem>
                  </Select>
                </FormControl>

                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="body2" gutterBottom>
                    Price Range: {formatPrice(filters.priceRange[0])} -{" "}
                    {formatPrice(filters.priceRange[1])}
                  </Typography>
                  <Slider
                    value={filters.priceRange}
                    onChange={(_, value) =>
                      handleFilterChange("priceRange", value)
                    }
                    valueLabelDisplay="auto"
                    min={0}
                    max={maxPrice}
                    step={Math.max(1, Math.floor(maxPrice / 100))}
                    valueLabelFormat={formatPrice}
                  />
                </Box>

                <Button variant="text" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </Box>
            </>
          )}
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
