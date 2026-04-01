import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CardMedia,
  Chip,
  Button,
  Autocomplete,
  TextField,
  Skeleton,
  Alert,
  Stack,
} from "@mui/material";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { getUpcomingCompetitions, searchCompetitions, getCacheStatus } from "../utils/wcaApi";

function Competitions() {
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [cubes, setCubes] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [loadingCubes, setLoadingCubes] = useState(false);
  const [error, setError] = useState(null);

  // Load competitions on mount
  useEffect(() => {
    loadCompetitions();
  }, []);

  // Load cubes when competition is selected
  useEffect(() => {
    if (selectedCompetition) {
      loadCubesForCompetition(selectedCompetition.id);
    }
  }, [selectedCompetition]);

  const loadCompetitions = async () => {
    try {
      setLoadingCompetitions(true);
      console.log('Cache status before loading:', getCacheStatus());
      const upcomingCompetitions = await getUpcomingCompetitions(500);
      console.log('Cache status after loading:', getCacheStatus());
      setCompetitions(upcomingCompetitions);
    } catch (err) {
      console.error('Error loading competitions:', err);
      setError('Failed to load competitions. Please try again.');
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const loadCubesForCompetition = async (competitionId) => {
    try {
      setLoadingCubes(true);

      // Query listings that have this competition in their competitions array
      const listingsRef = collection(db, 'listings');
      const q = query(
        listingsRef,
        where('status', '==', 'active'),
        where('deliveryOptions.meetup', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const allListings = [];

      querySnapshot.forEach((doc) => {
        const listing = { id: doc.id, ...doc.data() };
        allListings.push(listing);
      });

      // Filter listings that have the selected competition
      const cubesForCompetition = allListings.filter(listing =>
        listing.competitions &&
        listing.competitions.some(comp => comp.id === competitionId)
      );

      setCubes(cubesForCompetition);
    } catch (err) {
      console.error('Error loading cubes:', err);
      setError('Failed to load cubes for this competition.');
    } finally {
      setLoadingCubes(false);
    }
  };

  const handleCompetitionSearch = async (event, value) => {
    if (typeof value === 'string' && value.length > 1) {
      try {
        const searchResults = await searchCompetitions(value, 20);
        setCompetitions(searchResults);
      } catch (error) {
        console.error('Error searching competitions:', error);
      }
    }
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

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Competitions
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Find cubes available at upcoming WCA competitions
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Competition Selection */}
      <Card sx={{ mb: 4, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Select a Competition
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a competition to see available cubes for meetup
        </Typography>

        {loadingCompetitions ? (
          <Skeleton variant="rectangular" height={56} />
        ) : (
          <Autocomplete
            options={competitions}
            getOptionLabel={(option) => option.displayName}
            value={selectedCompetition}
            onChange={(_, newValue) => {
              setSelectedCompetition(newValue);
            }}
            onInputChange={handleCompetitionSearch}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search competitions"
                placeholder="Type to search competitions..."
                variant="outlined"
                fullWidth
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id}>
                <Box>
                  <Typography variant="body1">
                    {option.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.city}, {option.country} • {option.dateRange}
                  </Typography>
                </Box>
              </Box>
            )}
            noOptionsText="No competitions found. Try a different search term."
          />
        )}
      </Card>

      {/* Selected Competition Info */}
      {selectedCompetition && (
        <Card sx={{ mb: 4, p: 3, bgcolor: 'primary.50' }}>
          <Typography variant="h5" gutterBottom color="primary">
            {selectedCompetition.name}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Chip label={`${selectedCompetition.city}, ${selectedCompetition.country}`} />
            <Chip label={selectedCompetition.dateRange} />
          </Stack>
          {selectedCompetition.website && (
            <Button
              variant="outlined"
              size="small"
              href={selectedCompetition.website}
              target="_blank"
            >
              Competition Website
            </Button>
          )}
        </Card>
      )}

      {/* Cubes Grid */}
      {selectedCompetition && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5">
              Available Cubes ({cubes.length})
            </Typography>
          </Box>

          {loadingCubes ? (
            <Grid container spacing={3}>
              {[...Array(8)].map((_, index) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                  <Card>
                    <Skeleton variant="rectangular" height={200} />
                    <CardContent>
                      <Skeleton variant="text" />
                      <Skeleton variant="text" />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : cubes.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                No cubes available yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Be the first to list a cube for this competition!
              </Typography>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {cubes.map((cube) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={cube.id}>
                  <Card
                    component={Link}
                    to={`/listing/${cube.id}`}
                    sx={{
                      textDecoration: 'none',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                  >
                    <CardMedia
                      component="img"
                      height="200"
                      image={
                        cube.photos?.[0]
                          ? `https://wecube.s3.us-east-1.amazonaws.com/${cube.photos[0].s3Key}`
                          : "/placeholder-cube.jpg"
                      }
                      alt={cube.title}
                      sx={{
                        objectFit: "contain",
                        bgcolor: "grey.100",
                      }}
                    />
                    <CardContent>
                      <Typography variant="h6" noWrap gutterBottom>
                        {cube.title}
                      </Typography>
                      <Typography
                        variant="h5"
                        color="primary"
                        fontWeight="bold"
                        gutterBottom
                      >
                        {formatPrice(cube.price)}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                        <Chip
                          label={cube.condition}
                          size="small"
                          color={getConditionColor(cube.condition)}
                        />
                      </Stack>
                      {cube.competitions && cube.competitions.length > 1 && (
                        <Typography variant="body2" color="text.secondary">
                          Also at {cube.competitions.length - 1} other competition{cube.competitions.length > 2 ? 's' : ''}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </Box>
  );
}

export default Competitions;