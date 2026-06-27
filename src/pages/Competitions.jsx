import {
  Box,
  Typography,
  Card,
  CardActionArea,
  Chip,
  Autocomplete,
  TextField,
  Skeleton,
  Alert,
  Stack,
} from "@mui/material";
import { Close, KeyboardArrowRight } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  DEFAULT_COMPETITION_LOAD_LIMIT,
  getUpcomingCompetitions,
  searchCompetitions,
  getCacheStatus,
} from "../utils/wcaApi";

const SOFT_PANEL_SX = {
  bgcolor: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  boxShadow: "0 8px 24px rgba(31, 53, 99, 0.06)",
};

function Competitions() {
  const COMPETITION_BATCH_SIZE = 50;
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [competitionOptions, setCompetitionOptions] = useState([]);
  const [myCompetitionOptions, setMyCompetitionOptions] = useState([]);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
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
      const upcomingCompetitions = await getUpcomingCompetitions(
        DEFAULT_COMPETITION_LOAD_LIMIT
      );
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

  const handleCompetitionListScroll = async (event, target = "browse") => {
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

    const currentOptionCount =
      target === "browse"
        ? competitionOptions.length
        : myCompetitionOptions.length;
    const nextOptionCount = currentOptionCount + COMPETITION_BATCH_SIZE;

    try {
      const nextCompetitions =
        nextOptionCount <= allCompetitions.length
          ? allCompetitions
          : await getUpcomingCompetitions(nextOptionCount);

      setAllCompetitions(nextCompetitions);

      if (target === "browse") {
        setCompetitionOptions(nextCompetitions.slice(0, nextOptionCount));
      } else {
        setMyCompetitionOptions(nextCompetitions.slice(0, nextOptionCount));
      }
    } catch (error) {
      console.error("Error extending competition list:", error);
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

  const handleViewCompetitionListings = (competition) => {
    if (!competition?.id) {
      return;
    }

    navigate(`/competitions/${competition.id}/listings`, {
      state: { competition },
    });
  };

  const getCompetitionMeta = (competition) =>
    [competition.city, competition.country, competition.dateRange]
      .filter(Boolean)
      .join(" • ");

  return (
    <Box sx={{ width: "80vw", mx: "auto", p: 3, mt: 2 }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Competitions
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 2fr) minmax(300px, 0.8fr)",
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Card sx={{ p: 3, ...SOFT_PANEL_SX }}>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Select a Competition
          </Typography>

          {loadingCompetitions ? (
            <Stack spacing={1.5}>
              <Skeleton variant="rectangular" height={56} />
              {[...Array(6)].map((_, index) => (
                <Skeleton key={index} variant="rectangular" height={74} />
              ))}
            </Stack>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Search competitions"
                placeholder="Search US competitions..."
                value={competitionSearchInput}
                onChange={(event) =>
                  handleCompetitionSearch(event.target.value, "browse")
                }
                fullWidth
              />

              <Box
                onScroll={(event) => handleCompetitionListScroll(event, "browse")}
                sx={{
                  height: { xs: 430, md: 560 },
                  overflowY: "auto",
                  pr: 1,
                  mr: -1,
                }}
              >
                <Stack spacing={1.25}>
                  {competitionOptions.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 3, textAlign: "center" }}
                    >
                      No US competitions found.
                    </Typography>
                  ) : (
                    competitionOptions.map((competition) => (
                        <Card
                          key={competition.id}
                          variant="outlined"
                          sx={{
                            borderColor: "divider",
                            bgcolor: "rgba(255, 255, 255, 0.76)",
                            transition:
                              "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                            "&:hover": {
                              borderColor: "primary.main",
                              boxShadow: "0 8px 20px rgba(31, 53, 99, 0.08)",
                              transform: "translateY(-1px)",
                            },
                          }}
                        >
                          <CardActionArea
                            onClick={() => handleViewCompetitionListings(competition)}
                            sx={{ p: 2 }}
                          >
                            <Stack
                              direction="row"
                              spacing={2}
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="subtitle1"
                                  fontWeight={700}
                                  noWrap
                                >
                                  {competition.name}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  noWrap
                                >
                                  {getCompetitionMeta(competition)}
                                </Typography>
                              </Box>
                              <KeyboardArrowRight color="action" />
                            </Stack>
                          </CardActionArea>
                        </Card>
                      ))
                  )}
                </Stack>
              </Box>
            </Stack>
          )}
        </Card>

        <Card sx={{ p: 3, ...SOFT_PANEL_SX }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            My Competitions
          </Typography>

          {!currentUser ? (
            <Alert severity="info">Sign in to save competitions you are attending.</Alert>
          ) : (
            <Stack spacing={2}>
              <Autocomplete
                options={myCompetitionOptions}
                getOptionLabel={(option) => option.displayName}
                isOptionEqualToValue={(option, value) => option.id === value.id}
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
                    label="Add competition"
                    placeholder="Search US competitions..."
                    variant="outlined"
                    fullWidth
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Box>
                      <Typography variant="body1">{option.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {getCompetitionMeta(option)}
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
                <Stack spacing={1}>
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
                      sx={{
                        justifyContent: "space-between",
                        maxWidth: "100%",
                        height: "auto",
                        py: 0.75,
                        "& .MuiChip-label": {
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      }}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Card>
      </Box>

    </Box>
  );
}

export default Competitions;
