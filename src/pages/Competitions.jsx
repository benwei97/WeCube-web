import {
  Box,
  Typography,
  Card,
  TextField,
  Skeleton,
  Alert,
  Snackbar,
  Stack,
  IconButton,
} from "@mui/material";
import {
  Bookmark,
  BookmarkBorder,
  KeyboardArrowRight,
} from "@mui/icons-material";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import { AuthModal } from "../components/AuthModal";
import { getUpcomingCompetitionsFromList } from "../utils/listingUtils";
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
const COMPETITIONS_PAGE_CONTAINER_SX = {
  width: { xs: "100%", md: "80vw" },
  maxWidth: { xs: "100%", md: "none" },
  mx: "auto",
  p: { xs: 1.5, sm: 2.5, md: 3 },
  mt: 2,
};

const COMPETITION_BATCH_SIZE = 50;

function competitionMatchesSearch(competition, searchInput) {
  const normalizedSearch = searchInput.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    competition.name,
    competition.displayName,
    competition.city,
    competition.country,
    competition.dateRange,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
}

function Competitions() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [competitionOptions, setCompetitionOptions] = useState([]);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [optimisticSavedCompetitions, setOptimisticSavedCompetitions] =
    useState([]);
  const [error, setError] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [actionSnackbar, setActionSnackbar] = useState(null);

  const savedCompetitions = getUpcomingCompetitionsFromList(
    optimisticSavedCompetitions
  );
  const pinnedSavedCompetitions = savedCompetitions.filter((competition) =>
    competitionMatchesSearch(competition, competitionSearchInput)
  );
  const savedCompetitionIds = new Set(
    pinnedSavedCompetitions.map((competition) => competition.id)
  );
  const displayedCompetitionOptions = [
    ...pinnedSavedCompetitions,
    ...competitionOptions.filter(
      (competition) => !savedCompetitionIds.has(competition.id)
    ),
  ];

  useEffect(() => {
    setOptimisticSavedCompetitions(currentUser?.attendingCompetitions || []);
  }, [currentUser?.attendingCompetitions]);

  const resetCompetitionOptions = useCallback((competitionsList) => {
    const nextOptions = competitionsList.slice(0, COMPETITION_BATCH_SIZE);
    setCompetitionOptions(nextOptions);
  }, []);

  const loadCompetitions = useCallback(async () => {
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
  }, [resetCompetitionOptions]);

  // Load competitions on mount
  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  const handleCompetitionSearch = async (value) => {
    const normalizedValue = typeof value === "string" ? value : "";
    setCompetitionSearchInput(normalizedValue);

    if (normalizedValue.trim().length < 2) {
      setCompetitionOptions(allCompetitions.slice(0, COMPETITION_BATCH_SIZE));
      return;
    }

    try {
      const searchResults = await searchCompetitions(normalizedValue, 100);
      setCompetitionOptions(searchResults);
    } catch (error) {
      console.error('Error searching competitions:', error);
    }
  };

  const handleCompetitionListScroll = async (event) => {
    if (competitionSearchInput.trim().length >= 2) {
      return;
    }

    const listboxNode = event.currentTarget;
    const nearBottom =
      listboxNode.scrollTop + listboxNode.clientHeight >=
      listboxNode.scrollHeight - 24;

    if (!nearBottom) {
      return;
    }

    const nextOptionCount = competitionOptions.length + COMPETITION_BATCH_SIZE;

    try {
      const nextCompetitions =
        nextOptionCount <= allCompetitions.length
          ? allCompetitions
          : await getUpcomingCompetitions(nextOptionCount);

      setAllCompetitions(nextCompetitions);
      setCompetitionOptions(nextCompetitions.slice(0, nextOptionCount));
    } catch (error) {
      console.error("Error extending competition list:", error);
    }
  };

  const persistSavedCompetitions = async (nextCompetitions) => {
    if (!currentUser?.uid) {
      setShowAuth(true);
      return;
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        attendingCompetitions: nextCompetitions,
      });
    } catch (saveError) {
      console.error("Error saving attending competitions:", saveError);
      setActionSnackbar({
        severity: "error",
        message: "Failed to save your competitions.",
      });
      throw saveError;
    }
  };

  const isCompetitionSaved = (competitionId) =>
    savedCompetitions.some((competition) => competition.id === competitionId);

  const handleToggleSavedCompetition = async (event, competition) => {
    event.stopPropagation();
    event.currentTarget.blur();

    if (!currentUser?.uid) {
      setShowAuth(true);
      return;
    }

    const wasSaved = isCompetitionSaved(competition.id);
    const previousCompetitions = savedCompetitions;
    const nextCompetitions = wasSaved
      ? savedCompetitions.filter((item) => item.id !== competition.id)
      : [
          ...savedCompetitions,
          {
            id: competition.id,
            name: competition.name,
            displayName: competition.displayName || competition.name,
            city: competition.city,
            country: competition.country,
            dateRange: competition.dateRange,
          },
        ];

    setOptimisticSavedCompetitions(nextCompetitions);

    try {
      await persistSavedCompetitions(nextCompetitions);
    } catch {
      setOptimisticSavedCompetitions(previousCompetitions);
    }
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
    <Box sx={COMPETITIONS_PAGE_CONTAINER_SX}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        Competitions
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ mt: -0.5, mb: 2.5, maxWidth: 760 }}
      >
        See what cubes people are bringing to comps you are going to!
      </Typography>
      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        initialMode="login"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          width: "100%",
        }}
      >
        <Card sx={{ p: { xs: 2, sm: 2.5, md: 3 }, ...SOFT_PANEL_SX }}>
          {loadingCompetitions ? (
            <Stack spacing={1.5}>
              <Skeleton
                variant="rounded"
                height={52}
                animation="wave"
                sx={{ borderRadius: 2, bgcolor: "rgba(47, 107, 255, 0.08)" }}
              />
              {[...Array(6)].map((_, index) => (
                <Skeleton
                  key={index}
                  variant="rounded"
                  height={72}
                  animation="wave"
                  sx={{ borderRadius: 2, bgcolor: "rgba(16, 16, 16, 0.07)" }}
                />
              ))}
            </Stack>
          ) : (
            <Stack spacing={2}>
              <TextField
                placeholder="Search competitions..."
                value={competitionSearchInput}
                onChange={(event) =>
                  handleCompetitionSearch(event.target.value)
                }
                fullWidth
                slotProps={{
                  htmlInput: {
                    "aria-label": "Search competitions",
                  },
                }}
                helperText="Tip: bookmark your next comp to make buying and selling cubes there easier!"
              />

              <Box
                onScroll={handleCompetitionListScroll}
                sx={{
                  height: { xs: 430, md: 560 },
                  overflowY: "auto",
                  pt: 0.5,
                  pr: 1,
                  mr: -1,
                }}
              >
                <Stack spacing={1.25}>
                  {displayedCompetitionOptions.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 3, textAlign: "center" }}
                    >
                      No competitions found.
                    </Typography>
                  ) : (
                    displayedCompetitionOptions.map((competition) => {
                      const isSaved = isCompetitionSaved(competition.id);
                      return (
                        <Card
                          key={competition.id}
                          variant="outlined"
                          sx={{
                            borderColor: isSaved
                              ? "rgba(47, 107, 255, 0.42)"
                              : "divider",
                            bgcolor: isSaved
                              ? "rgba(47, 107, 255, 0.06)"
                              : "rgba(255, 255, 255, 0.76)",
                            transition:
                              "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                            "&:hover": {
                              borderColor: "primary.main",
                              boxShadow: "0 8px 20px rgba(31, 53, 99, 0.08)",
                              transform: "translateY(-1px)",
                            },
                          }}
                        >
                          <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                            sx={{ p: { xs: 1.5, md: 2 } }}
                          >
                            <Box
                              role="button"
                              tabIndex={0}
                              onClick={() => handleViewCompetitionListings(competition)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleViewCompetitionListings(competition);
                                }
                              }}
                              sx={{
                                minWidth: 0,
                                flex: 1,
                                cursor: "pointer",
                                "&:focus-visible": {
                                  outline: "2px solid",
                                  outlineColor: "primary.main",
                                  outlineOffset: 4,
                                  borderRadius: 1,
                                },
                              }}
                            >
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
                            <IconButton
                              aria-label={
                                isCompetitionSaved(competition.id)
                                  ? `Remove ${competition.name} from saved competitions`
                                  : `Save ${competition.name}`
                              }
                              onClick={(event) =>
                                handleToggleSavedCompetition(event, competition)
                              }
                              color={
                                isSaved
                                  ? "primary"
                                  : "default"
                              }
                              size="small"
                            >
                              {isSaved ? (
                                <Bookmark fontSize="small" />
                              ) : (
                                <BookmarkBorder fontSize="small" />
                              )}
                            </IconButton>
                            <KeyboardArrowRight color="action" />
                          </Stack>
                        </Card>
                      );
                    })
                  )}
                </Stack>
              </Box>
            </Stack>
          )}
        </Card>
      </Box>

      <Snackbar
        open={Boolean(actionSnackbar)}
        autoHideDuration={3600}
        onClose={(_, reason) => {
          if (reason !== "clickaway") {
            setActionSnackbar(null);
          }
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {actionSnackbar && (
          <Alert
            onClose={() => setActionSnackbar(null)}
            severity={actionSnackbar.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {actionSnackbar.message}
          </Alert>
        )}
      </Snackbar>

    </Box>
  );
}

export default Competitions;
