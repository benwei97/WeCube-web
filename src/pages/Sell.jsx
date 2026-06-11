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
} from "@mui/material";
import { Upload, Close } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { uploadMultipleImages } from "../utils/s3";
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
  PUZZLE_TYPE_OPTIONS,
} from "../utils/listingUtils";

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
    shippingAvailable: true,
    shippingIncluded: false,
    shippingCost: "",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
    meetupLocationLabel: "",
    meetupLocation: null,
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [allCompetitions, setAllCompetitions] = useState([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const { currentUser } = useAuth();

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
    const newPhotos = files.slice(0, 5 - selectedPhotos.length);

    const photoObjects = newPhotos.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      id: Date.now() + Math.random(),
    }));

    setSelectedPhotos((prev) => [...prev, ...photoObjects]);
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

    setFulfillmentData((prev) => ({
      ...prev,
      [field]: isChecked,
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

  const isDeliveryValid =
    fulfillmentData.shippingAvailable ||
    fulfillmentData.localMeetupAvailable ||
    fulfillmentData.competitionMeetupAvailable;
  const isCompetitionValid =
    !fulfillmentData.competitionMeetupAvailable ||
    selectedCompetitions.length > 0;
  const isMeetupLocationValid =
    !fulfillmentData.localMeetupAvailable ||
    Boolean(fulfillmentData.meetupLocationLabel.trim());
  const isShippingCostValid =
    !fulfillmentData.shippingAvailable ||
    fulfillmentData.shippingIncluded ||
    fulfillmentData.shippingCost !== "";

  const handleInputChange = (field) => (event) => {
    setListingData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setListingData((prev) => ({
        ...prev,
        price: value,
      }));
    }
  };

  const handleShippingCostChange = (event) => {
    const value = event.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(value)) {
      setFulfillmentData((prev) => ({
        ...prev,
        shippingCost: value,
      }));
    }
  };

  const resolveMeetupLocationForSave = async () => {
    if (!fulfillmentData.localMeetupAvailable) {
      return null;
    }

    const label = fulfillmentData.meetupLocationLabel.trim();
    if (!label) {
      return null;
    }

    if (fulfillmentData.meetupLocation?.label === label) {
      return fulfillmentData.meetupLocation;
    }

    try {
      const [suggestion] = await fetchLocationSuggestionOptions(label);
      return suggestion || null;
    } catch (error) {
      console.error("Error resolving meetup location:", error);
      return null;
    }
  };

  const handlePublishListing = async () => {
    setHasAttemptedSubmit(true);

    const isPhotosValid = selectedPhotos.length > 0;
    const isBasicInfoValid =
      listingData.title &&
      listingData.price &&
      listingData.condition &&
      listingData.description &&
      listingData.puzzleType;

    if (
      !isPhotosValid ||
      !isBasicInfoValid ||
      !isDeliveryValid ||
      !isMeetupLocationValid ||
      !isShippingCostValid
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (!isCompetitionValid) {
      alert("Please select at least one competition for meetup delivery");
      return;
    }

    if (!currentUser) {
      alert("You must be logged in to create a listing");
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

      const listingToSave = {
        title: listingData.title,
        price: parseFloat(listingData.price),
        description: listingData.description,
        condition: listingData.condition,
        puzzleType: listingData.puzzleType,
        location: fulfillmentData.meetupLocationLabel.trim(),
        meetupLocationLabel: fulfillmentData.meetupLocationLabel.trim(),
        meetupLocation:
          fulfillmentData.localMeetupAvailable && resolvedMeetupLocation
            ? resolvedMeetupLocation
            : null,
        photos: photosForStorage,
        deliveryOptions: {
          shipping: fulfillmentData.shippingAvailable,
          meetup:
            fulfillmentData.localMeetupAvailable ||
            fulfillmentData.competitionMeetupAvailable,
        },
        shippingAvailable: fulfillmentData.shippingAvailable,
        shippingIncluded: fulfillmentData.shippingIncluded,
        shippingProfile: "",
        shippingCost: fulfillmentData.shippingIncluded
          ? 0
          : parseFloat(fulfillmentData.shippingCost),
        localMeetupAvailable: fulfillmentData.localMeetupAvailable,
        competitionMeetupAvailable:
          fulfillmentData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((comp) => ({
          id: comp.id,
          name: comp.name,
          city: comp.city,
          country: comp.country,
          latitude: comp.latitude,
          longitude: comp.longitude,
          startDate: comp.startDate,
          endDate: comp.endDate,
          displayName: comp.displayName,
          dateRange: comp.dateRange,
        })),
        meetupCompetitionTags: selectedCompetitions.map((comp) => ({
          id: comp.id,
          name: comp.name,
          city: comp.city,
          country: comp.country,
          latitude: comp.latitude,
          longitude: comp.longitude,
          displayName: comp.displayName,
          dateRange: comp.dateRange,
        })),
        status: "active", // New listings start as active
        createdAt: new Date(),
        soldAt: null,
        soldTo: null,
        userId: currentUser.uid,
        listingId, // Store our custom ID for reference
      };

      const docRef = await addDoc(collection(db, "listings"), listingToSave);

      console.log("Listing saved successfully with ID:", docRef.id);

      handleClearListing();
      navigate(`/listing/${docRef.id}`, {
        state: { fromPublish: true },
      });
    } catch (error) {
      console.error("Error saving listing:", error);

      if (error.message.includes("upload")) {
        alert(`Failed to upload images: ${error.message}`);
      } else {
        alert(`Failed to publish listing: ${error.message}`);
      }
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
      shippingAvailable: true,
      shippingIncluded: false,
      shippingCost: "",
      localMeetupAvailable: false,
      competitionMeetupAvailable: false,
      meetupLocationLabel: "",
      meetupLocation: null,
    });
    setSelectedCompetitions([]);
    setHasAttemptedSubmit(false); // Reset validation state when clearing form
  };

  if (!currentUser) {
    return (
      <Box sx={{ width: "60vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          List Your Cube
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Please sign in to create a listing
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "60vw", mx: "auto", p: 3, mt: 2 }}>
      <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
        List Your Cube
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Fill out the details below to create your listing
      </Typography>

      <Stack spacing={3}>
        <Card
          variant="outlined"
          sx={{ width: "100%", boxShadow: "0 0 8px rgba(0, 0, 0, 0.1)" }}
        >
          {" "}
          <CardContent sx={{ p: 3 }}>
            <Typography
              variant="subtitle1"
              component="h2"
              fontWeight="bold"
              sx={{ mb: 1 }}
            >
              Photos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Add up to 5 photos of your cube
            </Typography>

            <Grid container spacing={2}>
              {selectedPhotos.map((photo, index) => (
                <Grid key={photo.id}>
                  <Box
                    sx={{
                      position: "relative",
                      width: "100%",
                      height: 120,
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: "grey.300",
                    }}
                  >
                    <img
                      src={photo.url}
                      alt={`Photo ${index + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
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
                    accept=".jpg,.jpeg,.png"
                    multiple
                    style={{ display: "none" }}
                    id="photo-upload"
                    onChange={handlePhotoSelection}
                  />
                  <label htmlFor="photo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      sx={{
                        width: 120,
                        height: 120,
                        border: "2px dashed",
                        borderColor: "grey.400",
                        borderRadius: 1,
                        color: "grey.600",
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
          </CardContent>
        </Card>

        <Card
          variant="outlined"
          sx={{ width: "100%", boxShadow: "0 0 8px rgba(0, 0, 0, 0.1)" }}
        >
          {" "}
          <CardContent sx={{ p: 3 }}>
            <Typography
              variant="subtitle1"
              component="h2"
              fontWeight="bold"
              sx={{ mb: 3 }}
            >
              Basic Information
            </Typography>

            <Stack spacing={3}>
              <TextField
                label="Title"
                fullWidth
                placeholder="e.g., Gan 356 X 3x3 Speed Cube"
                variant="outlined"
                value={listingData.title}
                onChange={handleInputChange("title")}
                required
              />

              <Grid container spacing={2}>
                <Grid>
                  <TextField
                    label="Price (USD)"
                    fullWidth
                    placeholder="25.00"
                    variant="outlined"
                    value={listingData.price}
                    onChange={handlePriceChange}
                    slotProps={{
                      htmlInput: {
                        inputMode: "decimal",
                      },
                    }}
                    required
                  />
                </Grid>
                <Grid>
                  <FormControl fullWidth variant="outlined" required>
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
                  </FormControl>
                </Grid>
                <Grid>
                  <FormControl fullWidth variant="outlined" required>
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
                required
              />

            </Stack>
          </CardContent>
        </Card>

        <Card
          variant="outlined"
          sx={{ width: "100%", boxShadow: "0 0 8px rgba(0, 0, 0, 0.1)" }}
        >
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" component="h2" fontWeight="bold">
              Fulfillment Methods
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Choose how buyers can receive this item{" "}
            </Typography>

            <FormControl
              sx={{ width: "100%" }}
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
                    <Typography variant="body1">Shipping</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Coordinate payment and delivery directly with the buyer
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.shippingAvailable}
                    onChange={handleFulfillmentChange("shippingAvailable")}
                  />
                </Box>
                {fulfillmentData.shippingAvailable && (
                  <Stack spacing={2} sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Box>
                        <Typography variant="body1">Shipping Included</Typography>
                        <Typography variant="body2" color="text.secondary">
                          If off, buyers will see an added shipping cost
                        </Typography>
                      </Box>
                      <Switch
                        checked={fulfillmentData.shippingIncluded}
                        onChange={handleFulfillmentChange("shippingIncluded")}
                      />
                    </Box>
                    {!fulfillmentData.shippingIncluded && (
                      <TextField
                        label="Shipping Price (USD)"
                        fullWidth
                        placeholder="e.g., 8.00"
                        value={fulfillmentData.shippingCost}
                        onChange={handleShippingCostChange}
                        error={hasAttemptedSubmit && !isShippingCostValid}
                        helperText="Set the shipping price buyers should expect to pay you directly."
                        slotProps={{
                          htmlInput: {
                            inputMode: "decimal",
                          },
                        }}
                        required
                      />
                    )}
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
                    <Typography variant="body1">Local Meetup</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Coordinate directly in chat and exchange offline
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.localMeetupAvailable}
                    onChange={handleFulfillmentChange("localMeetupAvailable")}
                  />
                </Box>
                {fulfillmentData.localMeetupAvailable && (
                  <Box sx={{ mt: 2, mb: 2 }}>
                    <Typography
                      variant="body2"
                      color={
                        hasAttemptedSubmit && !isMeetupLocationValid
                          ? "error"
                          : "text.secondary"
                      }
                      gutterBottom
                    >
                      Enter a general meetup area: *
                    </Typography>
                    <Autocomplete
                      options={locationOptions}
                      freeSolo
                      value={fulfillmentData.meetupLocationLabel || null}
                      inputValue={fulfillmentData.meetupLocationLabel}
                      getOptionLabel={getLocationOptionLabel}
                      onChange={(_, newValue) => {
                        const selectedLocation =
                          typeof newValue === "string" ? null : newValue;
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: getLocationOptionLabel(newValue),
                          meetupLocation: selectedLocation,
                        }));
                      }}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === "reset") {
                          return;
                        }
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newInputValue,
                          meetupLocation:
                            newInputValue === prev.meetupLocation?.label
                              ? prev.meetupLocation
                              : null,
                        }));
                      }}
                      loading={loadingLocations}
                      noOptionsText={
                        fulfillmentData.meetupLocationLabel.trim().length < 2
                          ? "Start typing a city..."
                          : "No matching cities found"
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="General Meetup Area"
                          placeholder="e.g., UCLA / Westwood"
                          helperText="Keep this approximate, not an exact address."
                          error={hasAttemptedSubmit && !isMeetupLocationValid}
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
                    <Typography variant="body1">Competition Meetup</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Meet at selected competitions
                    </Typography>
                  </Box>
                  <Switch
                    checked={fulfillmentData.competitionMeetupAvailable}
                    onChange={handleFulfillmentChange(
                      "competitionMeetupAvailable"
                    )}
                  />
                </Box>
              </FormGroup>

              {fulfillmentData.competitionMeetupAvailable && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="body2"
                    color={hasAttemptedSubmit && !isCompetitionValid ? "error" : "text.secondary"}
                    gutterBottom
                  >
                    Select competitions where this cube will be available for
                    meetup: *
                  </Typography>
                  <Autocomplete
                    multiple
                    options={competitions}
                    inputValue={competitionSearchInput}
                    getOptionLabel={(option) => option.displayName}
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    value={selectedCompetitions}
                    onChange={(_, newValue) => {
                      setSelectedCompetitions(newValue);
                    }}
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
                        label="Search competitions"
                        placeholder="Type to search competitions..."
                        variant="outlined"
                        error={hasAttemptedSubmit && !isCompetitionValid}
                      />
                    )}
                    renderTags={(tagValue, getTagProps) =>
                      tagValue.map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option.id}
                          label={`${option.name} - ${option.dateRange}`}
                          size="small"
                          variant="outlined"
                        />
                      ))
                    }
                    renderOption={(props, option) => (
                      <Box component="li" {...props} key={option.id}>
                        <Box>
                          <Typography variant="body1">{option.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {option.city}, {option.country} •{" "}
                            {option.dateRange}
                          </Typography>
                        </Box>
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
          </CardContent>
        </Card>

        <Box sx={{ display: "flex", justifyContent: "center", gap: 3, mt: 4 }}>
          <Button
            variant="outlined"
            size="large"
            onClick={handleClearListing}
            sx={{ px: 6, py: 2 }}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handlePublishListing}
            disabled={
              isPublishing ||
              !isDeliveryValid ||
              !isCompetitionValid ||
              !isMeetupLocationValid ||
              !isShippingCostValid
            }
            sx={{ px: 6, py: 2 }}
          >
            {isPublishing ? "Publishing..." : "Publish Listing"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default Sell;
