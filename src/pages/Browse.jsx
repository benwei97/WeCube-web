import {
  Box,
  Typography,
  Card,
  CardContent,
  CardMedia,
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
      setVisibleCount((prev) => prev + 4);
      setLoadingMore(false);
    }
  };

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
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {filteredListings.map((listing) => (
          <Box key={listing.id} sx={{ width: "calc(25% - 18px)" }}>
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
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: 3,
                },
              }}
              onClick={() => handleListingClick(listing.id)}
            >
              {normalizedListing.competitionMeetupAvailable && (
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
                    borderColor: hasCompetitionMatch ? "success.dark" : "divider",
                    color: hasCompetitionMatch ? "common.white" : "text.secondary",
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
              )}
              {listing.photos && listing.photos[0] ? (
                <CardMedia
                  component="img"
                  height="200"
                  image={`https://wecube.s3.us-east-1.amazonaws.com/${listing.photos[0].s3Key}`}
                  alt={listing.title}
                  sx={{ objectFit: "contain" }}
                />
              ) : (
                <Box
                  sx={{
                    height: 200,
                    backgroundColor: "grey.200",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No Image
                  </Typography>
                </Box>
              )}

              <CardContent
                sx={{
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  px: 3,
                  pb: 3,
                }}
              >
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {listing.title}
                </Typography>

                <Typography
                  variant="h5"
                  color="primary"
                  fontWeight="bold"
                  sx={{ mb: 0.25 }}
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
                      mb: 1,
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
                      sx={{ mt: "auto" }}
                    >
                      {normalizedListing.meetupLocationLabel}
                    </Typography>
                  )}
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

      {/* Load More Button - only show when not searching/filtering */}
      {!isSearching && hasMore && filteredListings.length > 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <Button
            variant="outlined"
            size="large"
            onClick={loadMoreListings}
            disabled={loadingMore}
            sx={{ px: 4, py: 1 }}
          >
            {loadingMore ? "Loading..." : "Load More Cubes"}
          </Button>
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
