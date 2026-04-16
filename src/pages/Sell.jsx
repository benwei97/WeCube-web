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
  Skeleton,
} from "@mui/material";
import { Upload, Close } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/AuthContext";
import { uploadMultipleImages } from "../utils/s3";
import { getConnectAccountStatus } from "../utils/stripe";
import SellerOnboarding from "../components/SellerOnboarding";
import { getUpcomingCompetitions, searchCompetitions, getCacheStatus } from "../utils/wcaApi";
import { fetchLocationSuggestions } from "../utils/locationSearch";
import {
  CONDITION_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  SHIPPING_PROFILE_OPTIONS,
} from "../utils/listingUtils";

function Sell() {
  const navigate = useNavigate();
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [listingData, setListingData] = useState({
    title: "",
    price: "",
    description: "",
    condition: "",
    puzzleType: "",
    brand: "",
  });
  const [fulfillmentData, setFulfillmentData] = useState({
    shippingAvailable: true,
    shippingIncluded: false,
    shippingProfile: "single_cube_standard",
    localMeetupAvailable: false,
    competitionMeetupAvailable: false,
    meetupLocationLabel: "",
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sellerOnboardingComplete, setSellerOnboardingComplete] =
    useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const { currentUser } = useAuth();

  // Check seller onboarding status
  useEffect(() => {
    if (currentUser) {
      checkSellerOnboarding();
    }
  }, [currentUser]);

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
        const suggestions = await fetchLocationSuggestions(query);
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

  // Handle URL parameters for onboarding redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (
      urlParams.get("success") === "true" ||
      urlParams.get("refresh") === "true"
    ) {
      // User returned from Stripe onboarding, recheck status
      if (currentUser) {
        setTimeout(() => checkSellerOnboarding(), 1000); // Small delay to allow Stripe to process
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Debug helper - clear stripe data if ?clear=true
    if (urlParams.get("clear") === "true" && currentUser) {
      clearStripeData();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [currentUser]);

  const clearStripeData = async () => {
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        stripeAccountId: null,
        sellerOnboardingStarted: null,
      });
      setSellerOnboardingComplete(false);
      console.log("Cleared Stripe data for fresh start");
    } catch (error) {
      console.error("Error clearing Stripe data:", error);
    }
  };

  const checkSellerOnboarding = async () => {
    try {
      setCheckingOnboarding(true);
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      const userData = userDoc.data();

      if (userData?.stripeAccountId) {
        try {
          const account = await getConnectAccountStatus(
            userData.stripeAccountId
          );
          setSellerOnboardingComplete(account.isComplete);
        } catch (accountError) {
          // If account doesn't exist or access is revoked, clear it and start fresh
          console.warn(
            "Stripe account not accessible, clearing stored account ID:",
            accountError
          );

          // Clear the invalid account ID from Firebase
          await updateDoc(doc(db, "users", currentUser.uid), {
            stripeAccountId: null,
            sellerOnboardingStarted: null,
          });

          setSellerOnboardingComplete(false);
        }
      } else {
        setSellerOnboardingComplete(false);
      }
    } catch (error) {
      console.error("Error checking seller onboarding:", error);
      setSellerOnboardingComplete(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

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
      }));
      setLocationOptions([]);
    }
  };

  const loadCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      console.log("Starting to load competitions...");
      console.log("Cache status before loading:", getCacheStatus());
      const upcomingCompetitions = await getUpcomingCompetitions(500); // Get more competitions
      console.log("Received competitions data:", upcomingCompetitions);
      console.log("Cache status after loading:", getCacheStatus());
      setCompetitions(upcomingCompetitions);
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
    console.log("Competition search triggered with value:", value);

    // Only search if user types something significant
    if (typeof value === "string" && value.length > 2) {
      setLoadingCompetitions(true);
      try {
        console.log("Searching for competitions with query:", value);
        const searchResults = await searchCompetitions(value, 100);
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
    }
    // Don't reload competitions when search is cleared - let filterOptions handle it
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
  const isShippingProfileValid =
    !fulfillmentData.shippingAvailable ||
    fulfillmentData.shippingIncluded ||
    Boolean(fulfillmentData.shippingProfile);

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
      !isShippingProfileValid
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

      // Get user's Stripe account ID for marketplace payments
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      const userData = userDoc.data();

      const listingToSave = {
        title: listingData.title,
        price: parseFloat(listingData.price),
        description: listingData.description,
        condition: listingData.condition,
        puzzleType: listingData.puzzleType,
        brand: listingData.brand.trim(),
        location: fulfillmentData.meetupLocationLabel.trim(),
        meetupLocationLabel: fulfillmentData.meetupLocationLabel.trim(),
        photos: photosForStorage,
        deliveryOptions: {
          shipping: fulfillmentData.shippingAvailable,
          meetup:
            fulfillmentData.localMeetupAvailable ||
            fulfillmentData.competitionMeetupAvailable,
        },
        shippingAvailable: fulfillmentData.shippingAvailable,
        shippingIncluded: fulfillmentData.shippingIncluded,
        shippingProfile: fulfillmentData.shippingIncluded
          ? ""
          : fulfillmentData.shippingProfile,
        shippingCost: 0,
        localMeetupAvailable: fulfillmentData.localMeetupAvailable,
        competitionMeetupAvailable:
          fulfillmentData.competitionMeetupAvailable,
        competitions: selectedCompetitions.map((comp) => ({
          id: comp.id,
          name: comp.name,
          city: comp.city,
          country: comp.country,
          startDate: comp.startDate,
          endDate: comp.endDate,
          displayName: comp.displayName,
          dateRange: comp.dateRange,
        })),
        meetupCompetitionTags: selectedCompetitions.map((comp) => ({
          id: comp.id,
          name: comp.name,
          displayName: comp.displayName,
          dateRange: comp.dateRange,
        })),
        status: "active", // New listings start as active
        createdAt: new Date(),
        soldAt: null,
        soldTo: null,
        userId: currentUser.uid,
        stripeAccountId: userData?.stripeAccountId, // Store seller's Stripe account ID
        listingId, // Store our custom ID for reference
      };

      const docRef = await addDoc(collection(db, "listings"), listingToSave);

      console.log("Listing saved successfully with ID:", docRef.id);

      handleClearListing();
      navigate(`/listing/${docRef.id}`);
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
      brand: "",
    });
    setFulfillmentData({
      shippingAvailable: true,
      shippingIncluded: false,
      shippingProfile: "single_cube_standard",
      localMeetupAvailable: false,
      competitionMeetupAvailable: false,
      meetupLocationLabel: "",
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

  if (checkingOnboarding) {
    return (
      <Box sx={{ width: "60vw", mx: "auto", p: 3, mt: 2, textAlign: "center" }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          List Your Cube
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Checking seller registration status...
        </Typography>
      </Box>
    );
  }

  if (!sellerOnboardingComplete) {
    return (
      <Box sx={{ width: "60vw", mx: "auto", p: 3, mt: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          List Your Cube
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Before you can list items for sale, you need to register as a seller
        </Typography>

        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h5" gutterBottom>
            Become a Verified Seller
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            To sell on WeCube, you need to complete a quick registration
            process. This helps us ensure secure payments and comply with
            financial regulations.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => setShowOnboarding(true)}
          >
            Start Seller Registration
          </Button>
        </Card>

        <SellerOnboarding
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onComplete={() => {
            setSellerOnboardingComplete(true);
            setShowOnboarding(false);
          }}
        />
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
                label="Brand"
                fullWidth
                placeholder="e.g., GAN, MoYu, QiYi"
                variant="outlined"
                value={listingData.brand}
                onChange={handleInputChange("brand")}
              />

              <TextField
                label="Description"
                fullWidth
                multiline
                rows={4}
                placeholder="Describe your cube's condition, features, and any included accessories..."
                variant="outlined"
                value={listingData.description}
                onChange={handleInputChange("description")}
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
                      Protected checkout through the app
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
                      <FormControl fullWidth>
                        <InputLabel>Shipping Type</InputLabel>
                        <Select
                          value={fulfillmentData.shippingProfile}
                          label="Shipping Type"
                          onChange={(event) => {
                            setFulfillmentData((prev) => ({
                              ...prev,
                              shippingProfile: event.target.value,
                            }));
                          }}
                        >
                          {SHIPPING_PROFILE_OPTIONS.map((profile) => (
                            <MenuItem key={profile.value} value={profile.value}>
                              {profile.label} ({`$${profile.price.toFixed(2)}`})
                            </MenuItem>
                          ))}
                        </Select>
                        <FormHelperText>
                          Pick the closest package type to keep shipping pricing
                          consistent.
                        </FormHelperText>
                      </FormControl>
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
                      onChange={(_, newValue) => {
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newValue || "",
                        }));
                      }}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === "reset") {
                          return;
                        }
                        setFulfillmentData((prev) => ({
                          ...prev,
                          meetupLocationLabel: newInputValue,
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
                  {loadingCompetitions ? (
                    <Skeleton variant="rectangular" width="100%" height={56} />
                  ) : (
                    <Autocomplete
                      multiple
                      options={competitions}
                      getOptionLabel={(option) => option.displayName}
                      value={selectedCompetitions}
                      onChange={(_, newValue) => {
                        setSelectedCompetitions(newValue);
                      }}
                      onInputChange={handleCompetitionSearch}
                      noOptionsText={
                        competitions.length === 0
                          ? "No competitions loaded. Try typing to search."
                          : "No competitions match your search."
                      }
                      loading={loadingCompetitions}
                      loadingText="Loading competitions..."
                      filterOptions={(options, { inputValue }) => {
                        // Show all options if no input, or filter by input
                        if (!inputValue) return options;
                        return options.filter(
                          (option) =>
                            option.name
                              .toLowerCase()
                              .includes(inputValue.toLowerCase()) ||
                            option.city
                              .toLowerCase()
                              .includes(inputValue.toLowerCase()) ||
                            option.country
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                        );
                      }}
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
                            <Typography variant="body1">
                              {option.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {option.city}, {option.country} •{" "}
                              {option.dateRange}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    />
                  )}
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
              !isShippingProfileValid
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
