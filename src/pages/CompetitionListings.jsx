import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Event, LocationOn, Search } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  LISTING_PAGE_SX,
  LISTING_CARD_CONTENT_SX,
  LISTING_CARD_GRID_SX,
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
import { getCompetitionById } from "../utils/wcaApi";
import { getS3PublicUrl } from "../utils/s3";
import ListingFulfillmentLine from "../components/ListingFulfillmentLine";

const BACK_BUTTON_SX = {
  color: "text.primary",
  borderColor: "rgba(148, 163, 184, 0.22)",
  "&:hover": {
    borderColor: "primary.main",
    bgcolor: "rgba(100, 108, 255, 0.04)",
  },
};

function CompetitionListings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { competitionId } = useParams();
  const [competition, setCompetition] = useState(location.state?.competition || null);
  const [cubes, setCubes] = useState([]);
  const [loadingCompetition, setLoadingCompetition] = useState(!location.state?.competition);
  const [loadingCubes, setLoadingCubes] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const returnTo = location.state?.returnTo;
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
          where("competitionMeetupAvailable", "==", true)
        );

        const querySnapshot = await getDocs(listingsQuery);
        const allListings = querySnapshot.docs.map((listingDoc) => ({
          id: listingDoc.id,
          ...listingDoc.data(),
        }));

        const cubesForCompetition = allListings.filter(
          (listing) =>
            !isListingModerationHidden(listing) &&
            isSoldListingPubliclyVisible(listing) &&
            (
              listing.meetupCompetitionTags?.some((comp) => comp.id === competitionId) ||
              listing.competitions?.some((comp) => comp.id === competitionId)
            )
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

  const formatPrice = formatListingPrice;

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredCubes = normalizedSearchTerm
    ? cubes.filter((cube) => {
        const normalizedListing = {
          ...cube,
          ...getNormalizedFulfillmentFields(cube),
        };
        const fulfillmentOption = getPrimaryFulfillmentOption(
          normalizedListing,
          { competitionId }
        );
        const searchableText = [
          cube.title,
          cube.description,
          cube.puzzleType,
          fulfillmentOption?.label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearchTerm);
      })
    : cubes;

  return (
    <Box sx={LISTING_PAGE_SX}>
      <Button
        onClick={() => (returnTo ? navigate(-1) : navigate("/competitions"))}
        variant="outlined"
        sx={{ mb: 3, ...BACK_BUTTON_SX }}
      >
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
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h3"
            component={competition.website ? "a" : "h1"}
            href={competition.website || undefined}
            target={competition.website ? "_blank" : undefined}
            rel={competition.website ? "noreferrer" : undefined}
            sx={{
              mb: 1,
              display: "inline-block",
              color: "text.primary",
              textDecoration: "none",
              "&:hover": competition.website
                ? { color: "primary.main", textDecoration: "underline" }
                : undefined,
            }}
            fontWeight="bold"
          >
            {competition.name}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.75, sm: 2 }}
            useFlexGap
            flexWrap="wrap"
            sx={{ color: "text.secondary" }}
          >
            {[competition.city, competition.country].filter(Boolean).length > 0 && (
              <Typography
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <LocationOn fontSize="small" />
                {[competition.city, competition.country].filter(Boolean).join(", ")}
              </Typography>
            )}
            {competition.dateRange && (
              <Typography
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <Event fontSize="small" />
                {competition.dateRange}
              </Typography>
            )}
          </Stack>
          <Paper
            sx={{
              p: 2,
              mt: 3,
              bgcolor: "#ffffff",
              border: "1px solid rgba(148, 163, 184, 0.14)",
              boxShadow: "0 2px 10px rgba(31, 53, 99, 0.04)",
            }}
          >
            <TextField
              placeholder="Search cubes..."
              variant="outlined"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <Search sx={{ mr: 1, color: "text.secondary" }} />
                  ),
                },
              }}
            />
          </Paper>
        </Box>
      ) : null}

      <Box sx={{ mb: 2 }}>
        {!loadingCubes && (
          <Typography variant="body2" color="text.secondary">
            {filteredCubes.length} {filteredCubes.length === 1 ? "cube" : "cubes"} found
          </Typography>
        )}
      </Box>

      {loadingCubes ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
          <Typography variant="body1">Loading listings...</Typography>
        </Stack>
      ) : filteredCubes.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {cubes.length === 0 ? "No cubes available yet" : "No cubes found"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {cubes.length === 0
              ? "Be the first to list a cube for this competition."
              : "Try a different search term."}
          </Typography>
        </Box>
      ) : (
        <Box sx={LISTING_CARD_GRID_SX}>
          {filteredCubes.map((cube) => {
            const normalizedListing = {
              ...cube,
              ...getNormalizedFulfillmentFields(cube),
            };
            const fulfillmentOption = getPrimaryFulfillmentOption(
              normalizedListing,
              { competitionId }
            );

            return (
              <Box key={cube.id}>
                <Card
                  component={Link}
                  to={`/listing/${cube.id}`}
                  sx={{
                    ...LISTING_CARD_SX,
                    textDecoration: "none",
                    "&:hover": {
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <ListingCardMediaFrame
                    imageUrl={
                      cube.photos?.[0]
                        ? getS3PublicUrl(cube.photos[0].s3Key)
                        : null
                    }
                    alt={cube.title}
                    isSold={cube.status === "sold"}
                    isPending={cube.status === "archived"}
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
                      color: "text.primary",
                    }}
                  >
                    <Box sx={LISTING_CARD_TEXT_STACK_SX}>
                      <Typography variant="h6" sx={LISTING_CARD_TITLE_SX}>
                        {cube.title}
                      </Typography>
                      <Typography
                        variant="h5"
                        color="text.primary"
                        fontWeight={600}
                        sx={{ mb: 0, lineHeight: 1.05, fontSize: { xs: "1.05rem", sm: "1.18rem" } }}
                      >
                        {formatPrice(cube.price)}
                      </Typography>
                      <ListingFulfillmentLine option={fulfillmentOption} />
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
