import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
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
import { getCompetitionById } from "../utils/wcaApi";

function CompetitionListings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { competitionId } = useParams();
  const { currentUser } = useAuth();
  const [competition, setCompetition] = useState(location.state?.competition || null);
  const [cubes, setCubes] = useState([]);
  const [loadingCompetition, setLoadingCompetition] = useState(!location.state?.competition);
  const [loadingCubes, setLoadingCubes] = useState(true);
  const [error, setError] = useState(null);
  const attendingCompetitionIds = new Set(
    (currentUser?.attendingCompetitions || []).map((savedCompetition) => savedCompetition.id)
  );

  useEffect(() => {
    if (competition) {
      return undefined;
    }

    let active = true;
    setLoadingCompetition(true);

    const loadCompetition = async () => {
      try {
        const nextCompetition = await getCompetitionById(competitionId);
        if (active) {
          setCompetition(nextCompetition);
        }
      } catch (competitionError) {
        console.error("Error loading competition details:", competitionError);
        if (active) {
          setError("Failed to load competition details.");
        }
      } finally {
        if (active) {
          setLoadingCompetition(false);
        }
      }
    };

    loadCompetition();

    return () => {
      active = false;
    };
  }, [competition, competitionId]);

  useEffect(() => {
    let active = true;
    setLoadingCubes(true);

    const loadCubes = async () => {
      try {
        const listingsRef = collection(db, "listings");
        const listingsQuery = query(
          listingsRef,
          where("deliveryOptions.meetup", "==", true)
        );

        const querySnapshot = await getDocs(listingsQuery);
        const allListings = querySnapshot.docs.map((listingDoc) => ({
          id: listingDoc.id,
          ...listingDoc.data(),
        }));

        const cubesForCompetition = allListings.filter(
          (listing) =>
            listing.status !== "archived" &&
            isSoldListingPubliclyVisible(listing) &&
            listing.competitions &&
            listing.competitions.some((comp) => comp.id === competitionId)
        );

        if (active) {
          setCubes(sortListingsByAvailabilityAndDate(cubesForCompetition));
        }
      } catch (cubeError) {
        console.error("Error loading cubes for competition:", cubeError);
        if (active) {
          setError("Failed to load listings for this competition.");
        }
      } finally {
        if (active) {
          setLoadingCubes(false);
        }
      }
    };

    loadCubes();

    return () => {
      active = false;
    };
  }, [competitionId]);

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Button onClick={() => navigate("/competitions")} variant="outlined" sx={{ mb: 3 }}>
        ← Back
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loadingCompetition ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
          <CircularProgress size={20} />
          <Typography variant="body1">Loading competition...</Typography>
        </Stack>
      ) : competition ? (
        <Card sx={{ mb: 4, p: 3, bgcolor: "primary.50" }}>
          <Typography variant="h4" gutterBottom color="primary" fontWeight="bold">
            {competition.name}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label={`${competition.city}, ${competition.country}`} />
            <Chip label={competition.dateRange} />
          </Stack>
          {competition.website && (
            <Button
              variant="outlined"
              size="small"
              href={competition.website}
              target="_blank"
            >
              Competition Website
            </Button>
          )}
        </Card>
      ) : null}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">
          Available Cubes
        </Typography>
        {!loadingCubes && (
          <Typography variant="body2" color="text.secondary">
            {cubes.length} {cubes.length === 1 ? "listing" : "listings"}
          </Typography>
        )}
      </Box>

      {loadingCubes ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
          <Typography variant="body1">Loading listings...</Typography>
        </Stack>
      ) : cubes.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            No cubes available yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Be the first to list a cube for this competition.
          </Typography>
        </Card>
      ) : (
        <Box sx={LISTING_CARD_GRID_SX}>
          {cubes.map((cube) => {
            const normalizedListing = {
              ...cube,
              ...getNormalizedFulfillmentFields(cube),
            };
            const shippingPrice = getShippingPriceFromListing(normalizedListing);
            const hasCompetitionMatch = normalizedListing.meetupCompetitionTags?.some(
              (savedCompetition) => attendingCompetitionIds.has(savedCompetition.id)
            );

            return (
              <Box key={cube.id}>
                <Card
                  component={Link}
                  to={`/listing/${cube.id}`}
                  sx={{
                    ...LISTING_CARD_SX,
                    textDecoration: "none",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: 3,
                    },
                  }}
                >
                  <ListingCardMediaFrame
                    imageUrl={
                      cube.photos?.[0]
                        ? `https://wecube.s3.us-east-1.amazonaws.com/${cube.photos[0].s3Key}`
                        : null
                    }
                    alt={cube.title}
                    imageSx={{ objectFit: "cover" }}
                    placeholderSx={{
                      backgroundColor: "grey.200",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    topLeftAdornment={
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
                    }
                  />

                  <CardContent
                    sx={{
                      ...LISTING_CARD_CONTENT_SX,
                      px: 3,
                      pb: 3,
                      color: "text.primary",
                    }}
                  >
                    <Box sx={LISTING_CARD_TEXT_STACK_SX}>
                      <Typography variant="h6" sx={LISTING_CARD_TITLE_SX}>
                        {cube.title}
                      </Typography>
                      <Typography
                        variant="h5"
                        color="primary"
                        fontWeight="bold"
                        sx={{ mb: 0, lineHeight: 1.1 }}
                      >
                        {formatPrice(cube.price)}
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
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default CompetitionListings;
