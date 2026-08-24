import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Grid,
  IconButton,
  Switch,
  FormGroup,
  FormHelperText,
  Autocomplete,
  Chip,
  Alert,
  Snackbar,
  InputAdornment,
} from "@mui/material";
import { Bookmark, Upload, Close } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import { MAX_IMAGE_SIZE_BYTES, uploadMultipleImages } from "../utils/s3";
import {
  DEFAULT_COMPETITION_LOAD_LIMIT,
  getUpcomingCompetitions,
  searchCompetitions,
  getCacheStatus,
} from "../utils/wcaApi";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import {
  CONDITION_OPTIONS,
  getUpcomingCompetitionsFromList,
  getListingCompetitionPayload,
  PUZZLE_TYPE_OPTIONS,
  parseNonNegativeCurrencyAmount,
} from "../utils/listingUtils";
import {
  characterCountText,
  clampText,
  formatCurrencyInputFromDigits,
  INPUT_LIMITS,
} from "../utils/inputLimits";
import PageState from "../components/PageState";
import { AuthModal } from "../components/AuthModal";

const SUPPORTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_PHOTO_SIZE_MB = Math.floor(MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
const MY_COMPETITIONS_OPTION_ID = "__my_competitions__";
const MY_COMPETITIONS_OPTION = {
  id: MY_COMPETITIONS_OPTION_ID,
  name: "My competitions",
  displayName: "My competitions",
  isMyCompetitionsOption: true,
};

function mergeCompetitionsById(currentCompetitions, competitionsToAdd) {
  const competitionsById = new Map(
    currentCompetitions
      .filter((competition) => !competition.isMyCompetitionsOption)
      .map((competition) => [competition.id, competition])
  );

  competitionsToAdd.forEach((competition) => {
    if (competition?.id && !competitionsById.has(competition.id)) {
      competitionsById.set(competition.id, competition);
    }
  });

  return [...competitionsById.values()];
}

const SOFT_FORM_CARD_SX = {
  width: "100%",
  bgcolor: "rgba(255, 255, 255, 0.72)",
  borderColor: "rgba(148, 163, 184, 0.22)",
  boxShadow: "0 8px 24px rgba(31, 53, 99, 0.06)",
};
const SELL_PAGE_CONTAINER_SX = {
  width: { xs: "100%", md: "60vw" },
  maxWidth: { xs: "100%", md: "none" },
  mx: "auto",
  p: { xs: 1.5, sm: 2.5, md: 3 },
  mt: 2,
};
const SELL_SECTION_SX = {
  px: { xs: 2, sm: 2.5, md: 3 },
};
const SELL_MEDIA_TILE_SX = {
  width: { xs: "min(42vw, 132px)", sm: 120 },
};
const COMPETITION_CHIP_SX = {
  borderRadius: 1,
  borderColor: "rgba(47, 107, 255, 0.32)",
  bgcolor: "rgba(47, 107, 255, 0.08)",
  color: "primary.main",
  fontWeight: 600,
  "& .MuiChip-label": {
    px: 1,
  },
  "& .MuiChip-deleteIcon": {
    color: "primary.main",
    opacity: 0.72,
    "&:hover": {
      color: "primary.dark",
      opacity: 1,
    },
  },
};

function Sell() {
  const COMPETITION_BATCH_SIZE = 50;
  const navigate = useNavigate();
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [listingData, setListingData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    puzzleType: "",
  });
  const [fulfillmentData, setFulfillmentData] = useState({
    shippingAvailable: false,
    shippingCost: "0.00",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
    meetupLocationLabel: "",
    meetupLocation: null,
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitNotice, setSubmitNotice] = useState(null);
  const [submitNoticePulse, setSubmitNoticePulse] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const { currentUser } = useAuth();
  const bookmarkedCompetitions = getUpcomingCompetitionsFromList(
    currentUser?.attendingCompetitions || []
  );
  const competitionOptions =
    bookmarkedCompetitions.length > 0
      ? [MY_COMPETITIONS_OPTION, ...competitions]
      : competitions;

  useEffect(() => {
    const query = fulfillmentData.meetupLocationLabel.trim();
    if (query.length < 2) {
      setLocationOptions([]);
      setLoadingLocations(false);
      return;
    }

    let active = true;
    setLoadingLocations(true);

    const timeoutId = setTimeout(async () => {
      try {
        const suggestions = await fetchLocationSuggestionOptions(query);
        if (active) {
          setLocationOptions(suggestions);
        }
      } catch (error) {
        console.error("Error loading location suggestions:", error);
        if (active) {
          setLocationOptions([]);
        }
      } finally {
        if (active) {
          setLoadingLocations(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [fulfillmentData.meetupLocationLabel]);

  const handlePhotoSelection = (e) => {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter(
      (file) =>
        SUPPORTED_PHOTO_TYPES.has(file.type) &&
        file.size <= MAX_IMAGE_SIZE_BYTES
    );
    const rejectedTypeCount = files.filter(
      (file) => !SUPPORTED_PHOTO_TYPES.has(file.type)
    ).length;
    const rejectedSizeCount = files.filter(
      (file) =>
        SUPPORTED_PHOTO_TYPES.has(file.type) &&
        file.size > MAX_IMAGE_SIZE_BYTES
    ).length;
    const newPhotos = imageFiles.slice(0, 5 - selectedPhotos.length);

    const photoObjects = newPhotos.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      id: Date.now() + Math.random(),
    }));

    if (photoObjects.length > 0) {
      setSelectedPhotos((prev) => [...prev, ...photoObjects]);
    }
    if (rejectedTypeCount > 0) {
      setSubmitNotice({
        severity: "error",
        message: "Photos must be JPG, PNG, or WebP.",
      });
    } else if (rejectedSizeCount > 0) {
      setSubmitNotice({
        severity: "error",
        message: `Photos must be ${MAX_PHOTO_SIZE_MB} MB or smaller.`,
      });
    } else {
      setSubmitNotice(null);
    }
    e.target.value = "";
  };

  const removePhoto = (photoId) => {
    setSelectedPhotos((prev) => {
      const updated = prev.filter((photo) => photo.id !== photoId);
      const photoToRemove = prev.find((photo) => photo.id === photoId);
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.url);
      }
      return updated;
    });
  };

  const handleFulfillmentChange = (field) => (event) => {
    const isChecked = event.target.checked;
    setSubmitNotice(null);

    setFulfillmentData((prev) => ({
      ...prev,
      [field]: isChecked,
      ...(field === "shippingAvailable" && isChecked && !prev.shippingCost
        ? { shippingCost: "0.00" }
        : {}),
    }));

    if (field === "competitionMeetupAvailable" && isChecked) {
      console.log("Meetup option selected, loading competitions");
      loadCompetitions();
    }

    if (field === "competitionMeetupAvailable" && !isChecked) {
      setSelectedCompetitions([]);
      setCompetitions([]);
    }

    if (field === "localMeetupAvailable" && !isChecked) {
      setFulfillmentData((prev) => ({
        ...prev,
        meetupLocationLabel: "",
        meetupLocation: null,
      }));
      setLocationOptions([]);
    }
  };

  const loadCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      console.log("Starting to load competitions...");
      console.log("Cache status before loading:", getCacheStatus());
      const upcomingCompetitions = await getUpcomingCompetitions(
        DEFAULT_COMPETITION_LOAD_LIMIT
      );
      console.log("Received competitions data:", upcomingCompetitions);
      console.log("Cache status after loading:", getCacheStatus());
      setAllCompetitions(upcomingCompetitions);
      setCompetitions(upcomingCompetitions.slice(0, COMPETITION_BATCH_SIZE));
      console.log(
        "Successfully loaded competitions:",
        upcomingCompetitions.length
      );
    } catch (error) {
      console.error("Error loading competitions:", error);
      console.error("Error details:", error.message, error.stack);
      // Don't throw the error, just log it so the search can still work
      setCompetitions([]);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const handleCompetitionSearch = async (_, value) => {
    const normalizedValue = typeof value === "string" ? value : "";
    setCompetitionSearchInput(normalizedValue);

    if (normalizedValue.trim().length < 2) {
      setCompetitions(allCompetitions.slice(0, COMPETITION_BATCH_SIZE));
      return;
    }

    console.log("Competition search triggered with value:", normalizedValue);
    setLoadingCompetitions(true);
    try {
      console.log("Searching for competitions with query:", normalizedValue);
      const searchResults = await searchCompetitions(normalizedValue, 100);
      console.log(
        "Search results:",
        searchResults.length,
        "competitions found"
      );
      setCompetitions(searchResults);
    } catch (error) {
      console.error("Error searching competitions:", error);
      // Keep existing competitions if search fails
    } finally {
      setLoadingCompetitions(false);
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

    const nextCompetitionCount = competitions.length + COMPETITION_BATCH_SIZE;

    try {
      const nextCompetitions =
        nextCompetitionCount <= allCompetitions.length
          ? allCompetitions
          : await getUpcomingCompetitions(nextCompetitionCount);

      setAllCompetitions(nextCompetitions);
      setCompetitions(nextCompetitions.slice(0, nextCompetitionCount));
    } catch (error) {
      console.error("Error extending competition list:", error);
    }
  };

  const handleCompetitionSelectionChange = (_, newValue) => {
    setSubmitNotice(null);

    const shouldAddBookmarkedCompetitions = newValue.some(
      (option) => option.isMyCompetitionsOption
    );

    if (shouldAddBookmarkedCompetitions) {
      setSelectedCompetitions((prev) =>
        mergeCompetitionsById(prev, bookmarkedCompetitions)
      );
      setCompetitionSearchInput("");
      return;
    }

    setSelectedCompetitions(
      newValue.filter((option) => !option.isMyCompetitionsOption)
    );
  };

  const isDeliveryValid =
    fulfillmentData.shippingAvailable ||
    fulfillmentData.localMeetupAvailable ||
    fulfillmentData.competitionMeetupAvailable;
  const isCompetitionValid =
    !fulfillmentData.competitionMeetupAvailable ||
    selectedCompetitions.length > 0;
  const isMeetupLocationValid =
    !fulfillmentData.localMeetupAvailable ||
    (Boolean(fulfillmentData.meetupLocationLabel.trim()) &&
      fulfillmentData.meetupLocation?.label ===
        fulfillmentData.meetupLocationLabel.trim());
  const isShippingCostValid =
    !fulfillmentData.shippingAvailable ||
    (parseNonNegativeCurrencyAmount(fulfillmentData.shippingCost) !== null &&
      parseNonNegativeCurrencyAmount(fulfillmentData.shippingCost) <=
        INPUT_LIMITS.SHIPPING_COST_MAX);
  const isPhotosInvalid = hasAttemptedSubmit && selectedPhotos.length === 0;
  const isTitleInvalid = hasAttemptedSubmit && !listingData.title.trim();
  const isPriceInvalid =
    hasAttemptedSubmit &&
    (!listingData.price ||
      parseNonNegativeCurrencyAmount(listingData.price) === null ||
      parseNonNegativeCurrencyAmount(listingData.price) >
        INPUT_LIMITS.LISTING_PRICE_MAX);
  const isPuzzleTypeInvalid = hasAttemptedSubmit && !listingData.puzzleType;
  const isConditionInvalid = hasAttemptedSubmit && !listingData.condition;
  const isDescriptionInvalid =
    hasAttemptedSubmit && !listingData.description.trim();

  const handleSubmitNoticeClose = (_, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSubmitNotice(null);
  };

  const handleInputChange = (field) => (event) => {
    const fieldLimits = {
      title: INPUT_LIMITS.LISTING_TITLE,
      description: INPUT_LIMITS.LISTING_DESCRIPTION,
    };
    const limit = fieldLimits[field];
    const value = limit
      ? clampText(event.target.value, limit)
      : event.target.value;

    setSubmitNotice(null);
    setListingData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePriceChange = (event) => {
    const value = formatCurrencyInputFromDigits(
      event.target.value,
      INPUT_LIMITS.LISTING_PRICE_MAX
    );

    if (value === null) {
      return;
    }

    setSubmitNotice(null);
    setListingData((prev) => ({
      ...prev,
      price: value,
    }));
  };

  const handleShippingCostChange = (event) => {
    const value = formatCurrencyInputFromDigits(
      event.target.value,
      INPUT_LIMITS.SHIPPING_COST_MAX
    );

    if (value === null) {
      return;
    }

    setSubmitNotice(null);
    setFulfillmentData((prev) => ({
      ...prev,
      shippingCost: value,
    }));
  };

  const resolveMeetupLocationForSave = async () => {
    if (!fulfillmentData.localMeetupAvailable) {
      return null;
    }

    if (
      fulfillmentData.meetupLocation?.label ===
      fulfillmentData.meetupLocationLabel.trim()
    ) {
      return fulfillmentData.meetupLocation;
    }
    return null;
  };

  const handlePublishListing = async () => {
    setHasAttemptedSubmit(true);

    const isPhotosValid = selectedPhotos.length > 0;
    const parsedPrice = parseNonNegativeCurrencyAmount(listingData.price);
    const isBasicInfoValid =
      listingData.title.trim() &&
      parsedPrice !== null &&
      parsedPrice <= INPUT_LIMITS.LISTING_PRICE_MAX &&
      listingData.condition &&
      listingData.description.trim() &&
      listingData.puzzleType;

    if (
      !isPhotosValid ||
      !isBasicInfoValid ||
      !isDeliveryValid ||
      !isMeetupLocationValid ||
      !isShippingCostValid
    ) {
      setSubmitNotice({
        severity: "error",
        message: !isDeliveryValid
          ? "Please select at least one fulfillment method before publishing."
          : "Please fill in all required fields before publishing.",
      });
      setSubmitNoticePulse((prev) => prev + 1);
      return;
    }

    if (!isCompetitionValid) {
      setSubmitNotice({
        severity: "error",
        message: "Please select at least one competition for meetup delivery.",
      });
      setSubmitNoticePulse((prev) => prev + 1);
      return;
    }

    if (!currentUser) {
      setShowAuth(true);
      return;
    }

    setIsPublishing(true);

    try {
      const listingId = `listing_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`;

      const files = selectedPhotos.map((photo) => photo.file);
      const s3Keys = await uploadMultipleImages(files, listingId);

      const photosForStorage = selectedPhotos.map((photo, index) => ({
        id: photo.id,
        name: photo.file.name,
        size: photo.file.size,
        type: photo.file.type,
        s3Key: s3Keys[index],
        uploadedAt: new Date(),
      }));

      const resolvedMeetupLocation = await resolveMeetupLocationForSave();

      const shippingCost = fulfillmentData.shippingAvailable
        ? parseNonNegativeCurrencyAmount(fulfillmentData.shippingCost)
        : 0;
      const shippingIncluded =
        fulfillmentData.shippingAvailable && shippingCost === 0;

      const listingToSave = {
        title: listingData.title.trim(),
        price: parsedPrice,
        description: listingData.description.trim(),
        condition: listingData.condition,
        puzzleType: listingData.puzzleType,
        meetupLocationLabel: fulfillmentData.meetupLocationLabel.trim(),
        meetupLocation:
          fulfillmentData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        photos: photosForStorage,
        shippingAvailable: fulfillmentData.shippingAvailable,
        shippingIncluded,
        shippingCost,
        localMeetupAvailable: fulfillmentData.localMeetupAvailable,
        competitionMeetupAvailable:
          fulfillmentData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition, { includeSchedule: true })
        ),
        meetupCompetitionTags: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition)
        ),
        status: "active", // New listings start as active
        createdAt: new Date(),
        soldAt: null,
        userId: currentUser.uid,
        listingId, // Store our custom ID for reference
      };

      const docRef = await addDoc(collection(db, "listings"), listingToSave);

      console.log("Listing saved successfully with ID:", docRef.id);

      handleClearListing();
      navigate(`/listing/${docRef.id}`, {
        state: {
          fromPublish: true,
          publishSuccess: true,
        },
      });
	    } catch (error) {
	      console.error("Error saving listing:", error);
	      const isUploadError = error.message?.toLowerCase().includes("upload");
	      setSubmitNotice({
	        severity: "error",
	        message: isUploadError
	          ? `Failed to upload photos: ${error.message}`
	          : `Failed to publish listing: ${error.message}`,
	      });
	      setSubmitNoticePulse((prev) => prev + 1);
	    } finally {
	      setIsPublishing(false);
	    }
  };

  const handleClearListing = () => {
    selectedPhotos.forEach((photo) => {
      URL.revokeObjectURL(photo.url);
    });

    setSelectedPhotos([]);
    setListingData({
      title: "",
      price: "",
      description: "",
      condition: "",
      puzzleType: "",
    });
    setFulfillmentData({
      shippingAvailable: false,
      shippingCost: "0.00",
      localMeetupAvailable: false,
      competitionMeetupAvailable: false,
      meetupLocationLabel: "",
      meetupLocation: null,
    });
    setSelectedCompetitions([]);
    setHasAttemptedSubmit(false); // Reset validation state when clearing form
    setSubmitNotice(null);
  };

  if (!currentUser) {
    return (
      <Box sx={SELL_PAGE_CONTAINER_SX}>
        <PageState
          title="Sign in to list your cube"
          message="Create an account or sign in to add photos, choose fulfillment options, and publish a listing."
          actionLabel="Log in"
          onAction={() => setShowAuth(true)}
        />
        <AuthModal
          open={showAuth}
          onClose={() => setShowAuth(false)}
          initialMode="login"
        />
      </Box>
    );
  }

  return (
    <Box sx={SELL_PAGE_CONTAINER_SX}>
      <Snackbar
        key={submitNoticePulse}
        open={Boolean(submitNotice)}
        autoHideDuration={3600}
        onClose={handleSubmitNoticeClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ mt: 7 }}
      >
        {submitNotice && (
          <Alert
            severity={submitNotice.severity}
            variant="filled"
            onClose={handleSubmitNoticeClose}
            sx={{
              minWidth: { xs: "calc(100vw - 32px)", sm: 420 },
              alignItems: "center",
              animation: "sellSubmitNoticePulse 420ms ease",
              "@keyframes sellSubmitNoticePulse": {
                "0%": {
                  transform: "translateY(-8px)",
                  opacity: 0,
                },
                "35%": {
                  transform: "translateY(2px)",
                  opacity: 1,
                },
                "100%": {
                  transform: "translateY(0)",
                  opacity: 1,
                },
              },
            }}
          >
            {submitNotice.message}
          </Alert>
        )}
      </Snackbar>

      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        fontWeight="bold"
        sx={{ mb: { xs: 2.5, md: 4 } }}
      >
        List Your Cube
      </Typography>

      <Stack spacing={{ xs: 2.25, md: 3 }}>
        <Card
          variant="outlined"
          sx={{
            ...SOFT_FORM_CARD_SX,
            borderColor: isPhotosInvalid ? "error.main" : undefined,
          }}
        >
          <CardContent sx={{ p: 0 }}>
          <Box sx={{ ...SELL_SECTION_SX, pt: { xs: 2, md: 3 }, pb: 2 }}>
            <Typography
              variant="subtitle1"
              component="h2"
              fontWeight="bold"
              sx={{ mb: 1 }}
            >
              Photos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 2, md: 3 } }}>
              Add 1-5 photos*
            </Typography>

            <Grid container spacing={{ xs: 1.5, md: 2 }}>
              {selectedPhotos.map((photo, index) => (
                <Grid key={photo.id}>
                  <Box
                    sx={{
                      position: "relative",
                      ...SELL_MEDIA_TILE_SX,
                      aspectRatio: "1 / 1",
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: "grey.300",
                      bgcolor: "grey.50",
                    }}
                  >
                    <img
                      src={photo.url}
                      alt={`Photo ${index + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                    <IconButton
                      size="small"
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        bgcolor: "rgba(0, 0, 0, 0.5)",
                        color: "white",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.7)",
                        },
                      }}
                      onClick={() => removePhoto(photo.id)}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </Box>
                </Grid>
              ))}

              {selectedPhotos.length < 5 && (
                <Grid item>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    capture="environment"
                    style={{ display: "none" }}
                    id="photo-upload"
                    onChange={handlePhotoSelection}
                  />
                  <label htmlFor="photo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      sx={{
                        ...SELL_MEDIA_TILE_SX,
                        aspectRatio: "1 / 1",
                        border: "2px dashed",
                        borderColor: isPhotosInvalid ? "error.main" : "grey.400",
                        borderRadius: 1,
                        color: isPhotosInvalid ? "error.main" : "grey.600",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1,
                        "&:hover": {
                          borderColor: "grey.500",
                          bgcolor: "grey.200",
                        },
                      }}
                    >
                      <Upload sx={{ fontSize: 30 }} />
                      Upload
                    </Button>
                  </label>
                </Grid>
              )}
            </Grid>
            {isPhotosInvalid && (
              <FormHelperText error sx={{ mt: 1 }}>
                Add at least one photo.
              </FormHelperText>
            )}
          </Box>

          <Box sx={{ ...SELL_SECTION_SX, py: 2 }}>
            <Typography
              variant="subtitle1"
              component="h2"
              fontWeight="bold"
              sx={{ mb: 3 }}
            >
              Basic Information
            </Typography>

            <Stack spacing={{ xs: 2.25, md: 3 }}>
              <TextField
                label="Title"
                fullWidth
                placeholder="ex. Gan 16 Maglev UV"
                variant="outlined"
                value={listingData.title}
                onChange={handleInputChange("title")}
                error={isTitleInvalid}
                helperText={isTitleInvalid ? "Enter a title." : ""}
                slotProps={{
                  htmlInput: {
                    maxLength: INPUT_LIMITS.LISTING_TITLE,
                  },
                }}
                required
              />

              <Grid container spacing={{ xs: 1.5, md: 2 }}>
                <Grid>
                  <TextField
                    label="Price"
                    placeholder="0.00"
                    variant="outlined"
                    value={listingData.price}
                    onChange={handlePriceChange}
                    error={isPriceInvalid}
                    helperText={
                      isPriceInvalid
                        ? `Enter a price from $0 to $${INPUT_LIMITS.LISTING_PRICE_MAX.toLocaleString()}.`
                        : ""
                    }
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">$</InputAdornment>
                        ),
                      },
                      htmlInput: {
                        inputMode: "numeric",
                        max: INPUT_LIMITS.LISTING_PRICE_MAX,
                      },
                    }}
                    sx={{
                      width: 108,
                      "& .MuiInputAdornment-root": { mr: 0.25 },
                      "& .MuiOutlinedInput-input": { px: 0.5 },
                    }}
                    required
                  />
                </Grid>
                <Grid>
                  <FormControl
                    fullWidth
                    variant="outlined"
                    error={isPuzzleTypeInvalid}
                    required
                  >
                    <InputLabel id="puzzle-type-label">Puzzle Type</InputLabel>
                    <Select
                      labelId="puzzle-type-label"
                      label="Puzzle Type"
                      value={listingData.puzzleType}
                      onChange={handleInputChange("puzzleType")}
                      sx={{ minWidth: 160 }}
                      required
                    >
                      {PUZZLE_TYPE_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                    {isPuzzleTypeInvalid && (
                      <FormHelperText>Select a puzzle type.</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid>
                  <FormControl
                    fullWidth
                    variant="outlined"
                    error={isConditionInvalid}
                    required
                  >
                    <InputLabel id="condition-label">Condition</InputLabel>
                    <Select
                      labelId="condition-label"
                      label="Condition"
                      value={listingData.condition}
                      onChange={handleInputChange("condition")}
                      sx={{ minWidth: 120 }}
                      required
                    >
                      {CONDITION_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                    {isConditionInvalid && (
                      <FormHelperText>Select a condition.</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                label="Description"
                fullWidth
                multiline
                rows={4}
                placeholder="Describe your cube's condition, features, and any included accessories..."
                variant="outlined"
                value={listingData.description}
                onChange={handleInputChange("description")}
                onFocus={() => setIsDescriptionFocused(true)}
                onBlur={() => setIsDescriptionFocused(false)}
                error={isDescriptionInvalid}
                helperText={
                  isDescriptionInvalid
                    ? "Enter a description."
                    : characterCountText(
                        listingData.description,
                        INPUT_LIMITS.LISTING_DESCRIPTION
                      )
                }
                slotProps={{
                  inputLabel: {
                    shrink:
                      isDescriptionFocused ||
                      Boolean(listingData.description.trim()),
                    sx: {
                      "&.MuiInputLabel-shrink": {
                        bgcolor: "background.paper",
                        px: 0.5,
                        mx: -0.5,
                      },
                    },
                  },
                  htmlInput: {
                    maxLength: INPUT_LIMITS.LISTING_DESCRIPTION,
                  },
                }}
                required
              />

            </Stack>
          </Box>

          <Box sx={{ ...SELL_SECTION_SX, pt: 2, pb: { xs: 2.5, md: 3 } }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Fulfillment Methods
            </Typography>

            <FormControl
              sx={{ width: "100%", mt: 3 }}
              error={hasAttemptedSubmit && (!isDeliveryValid || !isCompetitionValid)}
              required
            >
              <FormGroup>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body1">
                      Shipping
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.shippingAvailable}
                    onChange={handleFulfillmentChange("shippingAvailable")}
                    slotProps={{ input: { "aria-label": "Shipping" } }}
                  />
                </Box>
                {fulfillmentData.shippingAvailable && (
                  <Stack
                    spacing={1.75}
                    sx={{
                      mb: 2.5,
                      ml: { xs: 0, sm: 2 },
                      pl: { xs: 1.5, sm: 2.25 },
                      pt: 1,
                      pb: 0.5,
                      borderLeft: "1px solid",
                      borderColor: "rgba(47, 107, 255, 0.28)",
                    }}
                  >
                    <TextField
                      label="Shipping Price"
                      placeholder="0.00"
                      value={fulfillmentData.shippingCost}
                      onChange={handleShippingCostChange}
                      error={hasAttemptedSubmit && !isShippingCostValid}
                      helperText={
                        hasAttemptedSubmit && !isShippingCostValid
                          ? `Enter a shipping price from $0 to $${INPUT_LIMITS.SHIPPING_COST_MAX}.`
                          : "Keep at $0 if there is no additional shipping cost."
                      }
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">$</InputAdornment>
                          ),
                        },
                        htmlInput: {
                          inputMode: "numeric",
                          max: INPUT_LIMITS.SHIPPING_COST_MAX,
                        },
                      }}
                      sx={{
                        width: { xs: "100%", sm: 180 },
                        "& .MuiInputAdornment-root": { mr: 0.25 },
                      }}
                      required
                    />
                  </Stack>
                )}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body1">
                      Local Meetup
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.localMeetupAvailable}
                    onChange={handleFulfillmentChange("localMeetupAvailable")}
                    slotProps={{ input: { "aria-label": "Local Meetup" } }}
                  />
                </Box>
                {fulfillmentData.localMeetupAvailable && (
                  <Box sx={{ mb: 2 }}>
                    <Autocomplete
                      options={locationOptions}
                      value={fulfillmentData.meetupLocation}
                      inputValue={fulfillmentData.meetupLocationLabel}
                      getOptionLabel={getLocationOptionLabel}
                      isOptionEqualToValue={(option, value) =>
                        option?.label === value?.label
                      }
                      onChange={(_, newValue) => {
                        const selectedLocation =
                          typeof newValue === "string" ? null : newValue;
                        const label = clampText(
                          getLocationOptionLabel(newValue),
                          INPUT_LIMITS.LOCATION_LABEL
                        );
                        setSubmitNotice(null);
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: label,
                          meetupLocation: selectedLocation,
                        }));
                      }}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === "reset") {
                          return;
                        }
                        setSubmitNotice(null);
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: clampText(
                            newInputValue,
                            INPUT_LIMITS.LOCATION_LABEL
                          ),
                          meetupLocation:
                            newInputValue === prev.meetupLocation?.label
                              ? prev.meetupLocation
                              : null,
                        }));
                      }}
                      loading={loadingLocations}
                      noOptionsText={
                        fulfillmentData.meetupLocationLabel.trim().length < 2
                          ? "Start typing a location..."
                          : "No matching locations found"
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="General Meetup Area"
                          placeholder="ex. Los Angeles, CA"
                          helperText={
                            hasAttemptedSubmit && !isMeetupLocationValid
                              ? "Select a location from the list."
                              : undefined
                          }
                          error={hasAttemptedSubmit && !isMeetupLocationValid}
                          slotProps={{
                            htmlInput: {
                              ...params.inputProps,
                              maxLength: INPUT_LIMITS.LOCATION_LABEL,
                            },
                          }}
                          required
                        />
                      )}
                    />
                  </Box>
                )}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography variant="body1">
                      Competition Meetup
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.competitionMeetupAvailable}
                    onChange={handleFulfillmentChange(
                      "competitionMeetupAvailable"
                    )}
                    slotProps={{ input: { "aria-label": "Competition Meetup" } }}
                  />
                </Box>
              </FormGroup>

              {fulfillmentData.competitionMeetupAvailable && (
                <Box sx={{ mt: 2 }}>
                  <Autocomplete
                    multiple
                    options={competitionOptions}
                    inputValue={competitionSearchInput}
                    getOptionLabel={(option) =>
                      option.displayName || option.name || ""
                    }
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    value={selectedCompetitions}
                    onChange={handleCompetitionSelectionChange}
                    onInputChange={handleCompetitionSearch}
                    ListboxProps={{
                      onScroll: handleCompetitionListScroll,
                    }}
                    noOptionsText={
                      competitions.length === 0
                        ? "No competitions loaded. Try typing to search."
                        : "No competitions match your search."
                    }
                    loading={loadingCompetitions}
                    loadingText="Loading competitions..."
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Search competitions..."
                        variant="outlined"
                        error={hasAttemptedSubmit && !isCompetitionValid}
                        inputProps={{
                          ...params.inputProps,
                          "aria-label": "Search competitions",
                        }}
                        helperText={
                          hasAttemptedSubmit && !isCompetitionValid
                            ? "Select at least one competition."
                            : undefined
                        }
                      />
                    )}
                    renderTags={(tagValue, getTagProps) =>
                      tagValue.map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option.id}
                          label={option.name}
                          size="small"
                          variant="outlined"
                          sx={COMPETITION_CHIP_SX}
                        />
                      ))
                    }
                    renderOption={(props, option) => (
                      <Box component="li" {...props} key={option.id}>
                        {option.isMyCompetitionsOption ? (
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Bookmark fontSize="small" color="primary" />
                            <Box>
                              <Typography variant="body1">
                                My competitions
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Add all {bookmarkedCompetitions.length} bookmarked
                                competitions
                              </Typography>
                            </Box>
                          </Stack>
                        ) : (
                          <Box>
                            <Typography variant="body1">{option.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {option.city}, {option.country} •{" "}
                              {option.dateRange}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  />
                </Box>
              )}

              {!isDeliveryValid && (
                <FormHelperText error={hasAttemptedSubmit}>
                  Please select at least one fulfillment method
                </FormHelperText>
              )}
              {fulfillmentData.localMeetupAvailable && !isMeetupLocationValid && (
                <FormHelperText error={hasAttemptedSubmit}>
                  Please enter a general meetup area
                </FormHelperText>
              )}
              {fulfillmentData.competitionMeetupAvailable &&
                selectedCompetitions.length === 0 && (
                <FormHelperText error={hasAttemptedSubmit}>
                  Please select at least one competition for meetup delivery
                </FormHelperText>
              )}
            </FormControl>
          </Box>
          </CardContent>
        </Card>

        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: { xs: 1.5, md: 3 },
            mt: 1,
            flexDirection: { xs: "column-reverse", sm: "row" },
          }}
        >
          <Button
            variant="outlined"
            size="large"
            onClick={handleClearListing}
            fullWidth
            sx={{ px: 6, py: 2, maxWidth: { sm: 240 } }}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handlePublishListing}
            disabled={isPublishing}
            fullWidth
            sx={{ px: 6, py: 2, maxWidth: { sm: 260 } }}
          >
            {isPublishing ? "Publishing..." : "Publish Listing"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default Sell;
