import {
  Box,
  Typography,
  Card,
  Chip,
  Button,
  Autocomplete,
  TextField,
  Skeleton,
  Alert,
  Stack,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  getUpcomingCompetitions,
  searchCompetitions,
  getCacheStatus,
} from "../utils/wcaApi";

function Competitions() {
  const COMPETITION_BATCH_SIZE = 50;
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [competitionOptions, setCompetitionOptions] = useState([]);
  const [myCompetitionOptions, setMyCompetitionOptions] = useState([]);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [myCompetitionInput, setMyCompetitionInput] = useState("");
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [savingCompetition, setSavingCompetition] = useState(false);
  const [error, setError] = useState(null);

  const myCompetitions = currentUser?.attendingCompetitions || [];

  const resetCompetitionOptions = (competitionsList) => {
    const nextOptions = competitionsList.slice(0, COMPETITION_BATCH_SIZE);
    setCompetitionOptions(nextOptions);
    setMyCompetitionOptions(nextOptions);
  };

  // Load competitions on mount
  useEffect(() => {
    loadCompetitions();
  }, []);

  const loadCompetitions = async () => {
    try {
      setLoadingCompetitions(true);
      console.log('Cache status before loading:', getCacheStatus());
      const upcomingCompetitions = await getUpcomingCompetitions(500);
      console.log('Cache status after loading:', getCacheStatus());
      setAllCompetitions(upcomingCompetitions);
      resetCompetitionOptions(upcomingCompetitions);
    } catch (err) {
      console.error('Error loading competitions:', err);
      setError('Failed to load competitions. Please try again.');
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const handleCompetitionSearch = async (value, target = "browse") => {
    const normalizedValue = typeof value === "string" ? value : "";

    if (target === "browse") {
      setCompetitionSearchInput(normalizedValue);
    } else {
      setMyCompetitionInput(normalizedValue);
    }

    if (normalizedValue.trim().length < 2) {
      const resetOptions = allCompetitions.slice(0, COMPETITION_BATCH_SIZE);
      if (target === "browse") {
        setCompetitionOptions(resetOptions);
      } else {
        setMyCompetitionOptions(resetOptions);
      }
      return;
    }

    try {
      const searchResults = await searchCompetitions(normalizedValue, 100);
      if (target === "browse") {
        setCompetitionOptions(searchResults);
      } else {
        setMyCompetitionOptions(searchResults);
      }
    } catch (error) {
      console.error('Error searching competitions:', error);
    }
  };

  const handleCompetitionListScroll = (event, target = "browse") => {
    const activeInput = target === "browse" ? competitionSearchInput : myCompetitionInput;
    if (activeInput.trim().length >= 2) {
      return;
    }

    const listboxNode = event.currentTarget;
    const nearBottom =
      listboxNode.scrollTop + listboxNode.clientHeight >=
      listboxNode.scrollHeight - 24;

    if (!nearBottom) {
      return;
    }

    if (target === "browse") {
      if (competitionOptions.length < allCompetitions.length) {
        setCompetitionOptions(
          allCompetitions.slice(0, competitionOptions.length + COMPETITION_BATCH_SIZE)
        );
      }
    } else if (myCompetitionOptions.length < allCompetitions.length) {
      try {
        setMyCompetitionOptions(
          allCompetitions.slice(0, myCompetitionOptions.length + COMPETITION_BATCH_SIZE)
        );
      } catch (error) {
        console.error("Error extending competition list:", error);
      }
    }
  };

  const persistMyCompetitions = async (nextCompetitions) => {
    if (!currentUser?.uid) {
      alert("Sign in to save competitions you are attending.");
      return;
    }

    setSavingCompetition(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        attendingCompetitions: nextCompetitions,
      });
    } catch (saveError) {
      console.error("Error saving attending competitions:", saveError);
      alert("Failed to save your competitions.");
    } finally {
      setSavingCompetition(false);
    }
  };

  const handleAddMyCompetition = async (_, competition) => {
    if (!competition) return;

    const alreadyAdded = myCompetitions.some((item) => item.id === competition.id);
    if (alreadyAdded) {
      setMyCompetitionInput("");
      return;
    }

    const nextCompetitions = [
      ...myCompetitions,
      {
        id: competition.id,
        name: competition.name,
        displayName: competition.displayName || competition.name,
        city: competition.city,
        country: competition.country,
        dateRange: competition.dateRange,
      },
    ];

    await persistMyCompetitions(nextCompetitions);
    setMyCompetitionInput("");
  };

  const handleRemoveMyCompetition = async (competitionId) => {
    const nextCompetitions = myCompetitions.filter((competition) => competition.id !== competitionId);
    await persistMyCompetitions(nextCompetitions);
  };

  const handleViewCompetitionListings = () => {
    if (!selectedCompetition?.id) {
      return;
    }

    navigate(`/competitions/${selectedCompetition.id}/listings`, {
      state: { competition: selectedCompetition },
    });
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

      <Card sx={{ mb: 4, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Select a Competition
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a competition and open its listings page
        </Typography>

        {loadingCompetitions ? (
          <Skeleton variant="rectangular" height={56} />
        ) : (
          <Stack spacing={2}>
            <Autocomplete
              options={competitionOptions}
              getOptionLabel={(option) => option.displayName}
              value={selectedCompetition}
              inputValue={competitionSearchInput}
              onChange={(_, newValue) => {
                setSelectedCompetition(newValue);
              }}
              onInputChange={(_, value) => handleCompetitionSearch(value, "browse")}
              ListboxProps={{
                onScroll: (event) => handleCompetitionListScroll(event, "browse"),
              }}
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
            <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
              <Button
                variant="contained"
                onClick={handleViewCompetitionListings}
                disabled={!selectedCompetition}
              >
                View Listings
              </Button>
            </Box>
          </Stack>
        )}
      </Card>

      <Card sx={{ mb: 4, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          My Competitions
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Save the competitions you are attending to highlight matching listings across the marketplace.
        </Typography>

        {!currentUser ? (
          <Alert severity="info">Sign in to save competitions you are attending.</Alert>
        ) : (
          <Stack spacing={2}>
            <Autocomplete
              options={myCompetitionOptions}
              getOptionLabel={(option) => option.displayName}
              value={null}
              inputValue={myCompetitionInput}
              onChange={handleAddMyCompetition}
              onInputChange={(_, value) => {
                handleCompetitionSearch(value, "my");
              }}
              ListboxProps={{
                onScroll: (event) => handleCompetitionListScroll(event, "my"),
              }}
              loading={loadingCompetitions || savingCompetition}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Add a competition you are attending"
                  placeholder="Search competitions..."
                  variant="outlined"
                  fullWidth
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.id}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {option.city}, {option.country} • {option.dateRange}
                    </Typography>
                  </Box>
                </Box>
              )}
            />

            {myCompetitions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No saved competitions yet.
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {myCompetitions.map((competition) => (
                  <Chip
                    key={competition.id}
                    label={competition.displayName || competition.name}
                    onDelete={
                      savingCompetition
                        ? undefined
                        : () => handleRemoveMyCompetition(competition.id)
                    }
                    deleteIcon={<Close />}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Card>

    </Box>
  );
}

export default Competitions;
