import {
  Box,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Chip,
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
  query,
  getDocs,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "../../firebase";

function Browse() {
  const [listings, setListings] = useState([]);
  const [allListings, setAllListings] = useState([]); // For search/filter
  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
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

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [listings, allListings, filters]);

  // Check if user is actively searching/filtering
  useEffect(() => {
    const searching =
      filters.search ||
      filters.condition ||
      filters.priceRange[0] > 0 ||
      filters.priceRange[1] < maxPrice ||
      filters.deliveryOption;
    setIsSearching(searching);

    // If user starts searching, load all listings
    if (searching && allListings.length === 0) {
      fetchAllListings();
    }
  }, [filters, maxPrice, allListings.length]);

  const fetchListings = async (isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      }

      // Build query for paginated results (request one extra to check if there are more)
      const requestLimit = 4;
      let listingsQuery = query(
        collection(db, "listings"),
        orderBy("createdAt", "desc"),
        limit(requestLimit + 1)
      );

      // Add pagination cursor if loading more
      if (isLoadMore && lastDoc) {
        listingsQuery = query(
          collection(db, "listings"),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(requestLimit + 1)
        );
      }

      const listingsSnapshot = await getDocs(listingsQuery);
      const allDocs = listingsSnapshot.docs;

      // Check if there are more items than our limit
      const hasMoreItems = allDocs.length > requestLimit;
      setHasMore(hasMoreItems);

      // Only take the requested number of items (remove the extra one we fetched)
      const docsToUse = hasMoreItems ? allDocs.slice(0, requestLimit) : allDocs;
      const listingsData = docsToUse.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Update last document for pagination (use the last item we're actually displaying)
      const lastDocument = docsToUse[docsToUse.length - 1];
      setLastDoc(lastDocument);

      if (isLoadMore) {
        // Filter out any duplicates before adding
        setListings((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const newItems = listingsData.filter(
            (item) => !existingIds.has(item.id)
          );
          console.log(
            `Loading more: ${newItems.length} new items, ${
              listingsData.length - newItems.length
            } duplicates filtered`
          );
          return [...prev, ...newItems];
        });
        setLoadingMore(false);
      } else {
        setListings(listingsData);

        // Calculate max price from initial listings (will be updated when all listings load)
        const prices = listingsData
          .map((listing) => listing.price)
          .filter((price) => price && !isNaN(price));

        const calculatedMaxPrice =
          prices.length > 0 ? Math.max(...prices) : 1000;
        const roundedMaxPrice = Math.ceil(calculatedMaxPrice / 10) * 10;

        setMaxPrice(roundedMaxPrice);
        setFilters((prev) => ({
          ...prev,
          priceRange: [0, roundedMaxPrice],
        }));

        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching listings:", error);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchAllListings = async () => {
    try {
      const allListingsQuery = query(
        collection(db, "listings"),
        orderBy("createdAt", "desc")
      );
      const allListingsSnapshot = await getDocs(allListingsQuery);
      const allListingsData = allListingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setAllListings(allListingsData);

      // Recalculate max price from all listings
      const allPrices = allListingsData
        .map((listing) => listing.price)
        .filter((price) => price && !isNaN(price));

      if (allPrices.length > 0) {
        const calculatedMaxPrice = Math.max(...allPrices);
        const roundedMaxPrice = Math.ceil(calculatedMaxPrice / 10) * 10;
        setMaxPrice(roundedMaxPrice);
      }
    } catch (error) {
      console.error("Error fetching all listings:", error);
    }
  };

  const loadMoreListings = () => {
    if (!isSearching && hasMore && !loadingMore) {
      fetchListings(true);
    }
  };

  const applyFilters = () => {
    // Use allListings for search/filter, listings for pagination
    const sourceListings = isSearching ? allListings : listings;
    let filtered = [...sourceListings];

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
        if (filters.deliveryOption === "shipping") {
          return listing.deliveryOptions?.shipping;
        }
        if (filters.deliveryOption === "meetup") {
          return listing.deliveryOptions?.meetup;
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

  const getConditionColor = (condition) => {
    const colors = {
      new: "success",
      "like-new": "success",
      excellent: "info",
      good: "warning",
      fair: "warning",
      used: "default",
    };
    return colors[condition] || "default";
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

              <Chip
                label={listing.condition}
                size="small"
                color={getConditionColor(listing.condition)}
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                }}
              />

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
                  sx={{ mb: 1 }}
                >
                  {formatPrice(listing.price)}
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Chip
                    label={listing.status === "sold" ? "Sold" : "Available"}
                    size="small"
                    color={listing.status === "sold" ? "default" : "success"}
                  />
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: "auto" }}>
                  {listing.deliveryOptions?.shipping && (
                    <Chip label="Shipping" size="small" variant="outlined" />
                  )}
                  {listing.deliveryOptions?.meetup && (
                    <Chip label="Meetup" size="small" variant="outlined" />
                  )}
                </Stack>
              </CardContent>
            </Card>
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
