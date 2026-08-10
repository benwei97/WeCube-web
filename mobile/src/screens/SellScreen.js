import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { addDoc, collection } from "firebase/firestore";
import Screen from "../components/Screen";
import ScreenTitle from "../components/ScreenTitle";
import Toggle from "../components/Toggle";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import {
  CONDITION_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
} from "../utils/listingUtils";
import {
  characterCountText,
  clampText,
  formatCurrencyInputFromDigits,
  INPUT_LIMITS,
} from "../utils/inputLimits";
import {
  fetchLocationSuggestionOptions,
  getLocationOptionLabel,
} from "../utils/locationSearch";
import { uploadImageAssetToS3 } from "../utils/s3";
import { searchCompetitions } from "../utils/wcaApi";

const MY_COMPETITIONS_OPTION_ID = "__my_competitions__";
const COMPETITION_BATCH_SIZE = 25;
const INITIAL_COMPETITION_LIMIT = 50;

const MY_COMPETITIONS_OPTION = {
  id: MY_COMPETITIONS_OPTION_ID,
  name: "My competitions",
  displayName: "My competitions",
  isMyCompetitionsOption: true,
};

function parseNonNegativeCurrencyAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getListingCompetitionPayload(competition = {}, options = {}) {
  const payload = {
    id: competition.id || "",
    name: competition.name || "",
    city: competition.city || "",
    country: competition.country || competition.countryIso2 || "",
    latitude:
      typeof competition.latitude === "number" ? competition.latitude : null,
    longitude:
      typeof competition.longitude === "number" ? competition.longitude : null,
    displayName:
      competition.displayName || competition.name || "Competition meetup",
    dateRange: competition.dateRange || "",
  };

  if (options.includeSchedule) {
    payload.startDate = competition.startDate || null;
    payload.endDate = competition.endDate || null;
  }

  return payload;
}

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

function RequiredLabel({ children }) {
  return (
    <Text style={styles.label}>
      {children}
      <Text style={styles.required}>*</Text>
    </Text>
  );
}

function HelperText({ children, error }) {
  if (!children) return null;
  return (
    <Text style={[styles.helper, error && styles.errorText]}>
      {children}
    </Text>
  );
}

function SelectField({
  label,
  required,
  value,
  placeholder,
  error,
  helperText,
  options,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <View>
      {required ? <RequiredLabel>{label}</RequiredLabel> : <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={[styles.input, styles.selectInput, error && styles.inputError]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.selectText,
            !selectedOption && styles.placeholderText,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <Text style={styles.selectChevron}>⌄</Text>
      </Pressable>
      <HelperText error={error}>{helperText}</HelperText>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.selectPanel}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.selectOption,
                    selected && styles.selectOptionSelected,
                  ]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      selected && styles.selectOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PhotoTile({ photo, index, onRemove }) {
  return (
    <View style={styles.photoTile}>
      <Image source={{ uri: photo.uri }} style={styles.photo} />
      <Pressable
        style={styles.removePhotoButton}
        onPress={() => onRemove(photo.uri)}
        accessibilityLabel={`Remove photo ${index + 1}`}
      >
        <Text style={styles.removePhotoText}>×</Text>
      </Pressable>
    </View>
  );
}

export default function SellScreen({ navigation }) {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [puzzleType, setPuzzleType] = useState("");
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [shippingCost, setShippingCost] = useState("0.00");
  const [localMeetupAvailable, setLocalMeetupAvailable] = useState(false);
  const [meetupLocationLabel, setMeetupLocationLabel] = useState("");
  const [meetupLocation, setMeetupLocation] = useState(null);
  const [locationOptions, setLocationOptions] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [competitionMeetupAvailable, setCompetitionMeetupAvailable] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [competitionSearchInput, setCompetitionSearchInput] = useState("");
  const [competitionLimit, setCompetitionLimit] = useState(INITIAL_COMPETITION_LIMIT);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [selectedCompetitions, setSelectedCompetitions] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitNotice, setSubmitNotice] = useState("");
  const [publishing, setPublishing] = useState(false);

  const bookmarkedCompetitions = currentUser?.attendingCompetitions || [];
  const competitionOptions = useMemo(
    () =>
      bookmarkedCompetitions.length > 0
        ? [MY_COMPETITIONS_OPTION, ...competitions]
        : competitions,
    [bookmarkedCompetitions.length, competitions]
  );

  const selectedCompetitionIds = useMemo(
    () => new Set(selectedCompetitions.map((competition) => competition.id)),
    [selectedCompetitions]
  );

  useEffect(() => {
    let active = true;
    const query = meetupLocationLabel.trim();

    if (!localMeetupAvailable || query.length < 2) {
      setLocationOptions([]);
      setLoadingLocations(false);
      return undefined;
    }

    setLoadingLocations(true);
    const timeoutId = setTimeout(async () => {
      try {
        const options = await fetchLocationSuggestionOptions(query);
        if (active) setLocationOptions(options);
      } catch (locationError) {
        console.error("Error loading mobile meetup locations:", locationError);
        if (active) setLocationOptions([]);
      } finally {
        if (active) setLoadingLocations(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [localMeetupAvailable, meetupLocationLabel]);

  useEffect(() => {
    if (!competitionMeetupAvailable) return;
    setCompetitionLimit(INITIAL_COMPETITION_LIMIT);
  }, [competitionMeetupAvailable, competitionSearchInput]);

  useEffect(() => {
    let active = true;

    if (!competitionMeetupAvailable) {
      setCompetitions([]);
      setLoadingCompetitions(false);
      return undefined;
    }

    setLoadingCompetitions(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCompetitions(
          competitionSearchInput,
          competitionLimit
        );
        if (active) setCompetitions(results);
      } catch (competitionError) {
        console.error("Error loading mobile sell competitions:", competitionError);
        if (active) setCompetitions([]);
      } finally {
        if (active) setLoadingCompetitions(false);
      }
    }, competitionSearchInput.trim().length >= 2 ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [competitionLimit, competitionMeetupAvailable, competitionSearchInput]);

  const isDeliveryValid =
    shippingAvailable || localMeetupAvailable || competitionMeetupAvailable;
  const isCompetitionValid =
    !competitionMeetupAvailable || selectedCompetitions.length > 0;
  const isMeetupLocationValid =
    !localMeetupAvailable ||
    (Boolean(meetupLocationLabel.trim()) &&
      meetupLocation?.label === meetupLocationLabel.trim());
  const isShippingCostValid =
    !shippingAvailable ||
    (parseNonNegativeCurrencyAmount(shippingCost) !== null &&
      parseNonNegativeCurrencyAmount(shippingCost) <=
        INPUT_LIMITS.SHIPPING_COST_MAX);
  const isPhotosInvalid = hasAttemptedSubmit && photos.length === 0;
  const isTitleInvalid = hasAttemptedSubmit && !title.trim();
  const isPriceInvalid =
    hasAttemptedSubmit &&
    (!price ||
      parseNonNegativeCurrencyAmount(price) === null ||
      parseNonNegativeCurrencyAmount(price) > INPUT_LIMITS.LISTING_PRICE_MAX);
  const isPuzzleTypeInvalid = hasAttemptedSubmit && !puzzleType;
  const isConditionInvalid = hasAttemptedSubmit && !condition;
  const isDescriptionInvalid = hasAttemptedSubmit && !description.trim();

  function clearSubmitNotice() {
    if (submitNotice) setSubmitNotice("");
  }

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to add listing photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.85,
      selectionLimit: Math.max(1, 5 - photos.length),
    });

    if (result.canceled) return;
    clearSubmitNotice();
    setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
  }

  function removePhoto(uri) {
    clearSubmitNotice();
    setPhotos((prev) => prev.filter((photo) => photo.uri !== uri));
  }

  function handleTitleChange(value) {
    clearSubmitNotice();
    setTitle(clampText(value, INPUT_LIMITS.LISTING_TITLE));
  }

  function handleDescriptionChange(value) {
    clearSubmitNotice();
    setDescription(clampText(value, INPUT_LIMITS.LISTING_DESCRIPTION));
  }

  function handlePriceChange(value) {
    const formattedValue = formatCurrencyInputFromDigits(
      value,
      INPUT_LIMITS.LISTING_PRICE_MAX
    );
    if (formattedValue === null) return;
    clearSubmitNotice();
    setPrice(formattedValue);
  }

  function handleShippingCostChange(value) {
    const formattedValue = formatCurrencyInputFromDigits(
      value,
      INPUT_LIMITS.SHIPPING_COST_MAX
    );
    if (formattedValue === null) return;
    clearSubmitNotice();
    setShippingCost(formattedValue || "0.00");
  }

  function handleLocalMeetupChange(value) {
    clearSubmitNotice();
    setLocalMeetupAvailable(value);
    if (!value) {
      setMeetupLocationLabel("");
      setMeetupLocation(null);
      setLocationOptions([]);
    }
  }

  function handleCompetitionMeetupChange(value) {
    clearSubmitNotice();
    setCompetitionMeetupAvailable(value);
    if (!value) {
      setSelectedCompetitions([]);
      setCompetitionSearchInput("");
      setCompetitions([]);
    }
  }

  function handleCompetitionSelect(competition) {
    clearSubmitNotice();
    if (competition.isMyCompetitionsOption) {
      setSelectedCompetitions((current) =>
        mergeCompetitionsById(current, bookmarkedCompetitions)
      );
      return;
    }

    setSelectedCompetitions((current) =>
      selectedCompetitionIds.has(competition.id)
        ? current.filter((item) => item.id !== competition.id)
        : [...current, competition]
    );
  }

  function clearListing() {
    setTitle("");
    setPrice("");
    setDescription("");
    setCondition("");
    setPuzzleType("");
    setShippingAvailable(false);
    setShippingCost("0.00");
    setLocalMeetupAvailable(false);
    setMeetupLocationLabel("");
    setMeetupLocation(null);
    setCompetitionMeetupAvailable(false);
    setCompetitionSearchInput("");
    setSelectedCompetitions([]);
    setPhotos([]);
    setHasAttemptedSubmit(false);
    setSubmitNotice("");
  }

  async function publishListing() {
    setHasAttemptedSubmit(true);
    const parsedPrice = parseNonNegativeCurrencyAmount(price);

    const isBasicInfoValid =
      title.trim() &&
      parsedPrice !== null &&
      parsedPrice <= INPUT_LIMITS.LISTING_PRICE_MAX &&
      condition &&
      description.trim() &&
      puzzleType;

    if (
      photos.length === 0 ||
      !isBasicInfoValid ||
      !isDeliveryValid ||
      !isMeetupLocationValid ||
      !isShippingCostValid
    ) {
      setSubmitNotice(
        !isDeliveryValid
          ? "Please select at least one fulfillment method before publishing."
          : "Please fill in all required fields before publishing."
      );
      return;
    }

    if (!isCompetitionValid) {
      setSubmitNotice("Please select at least one competition for meetup delivery.");
      return;
    }

    if (!currentUser?.uid) {
      setSubmitNotice("You must be logged in to create a listing.");
      return;
    }

    setPublishing(true);
    setSubmitNotice("");

    try {
      const listingId = `listing_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      const uploadedPhotos = [];

      for (const photo of photos) {
        uploadedPhotos.push(await uploadImageAssetToS3(photo, listingId));
      }

      const shippingPrice = shippingAvailable
        ? parseNonNegativeCurrencyAmount(shippingCost)
        : 0;
      const listingToSave = {
        title: title.trim(),
        price: parsedPrice,
        description: description.trim(),
        condition,
        puzzleType,
        meetupLocationLabel: meetupLocationLabel.trim(),
        meetupLocation: localMeetupAvailable ? meetupLocation : null,
        photos: uploadedPhotos,
        shippingAvailable,
        shippingIncluded: shippingAvailable && shippingPrice === 0,
        shippingCost: shippingPrice,
        localMeetupAvailable,
        competitionMeetupAvailable,
        competitions: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition, { includeSchedule: true })
        ),
        meetupCompetitionTags: selectedCompetitions.map((competition) =>
          getListingCompetitionPayload(competition)
        ),
        status: "active",
        createdAt: new Date(),
        soldAt: null,
        userId: currentUser.uid,
        listingId,
      };

      const docRef = await addDoc(collection(db, "listings"), listingToSave);
      clearListing();
      Alert.alert("Listing published", "Your listing is now active.", [
        {
          text: "View listing",
          onPress: () =>
            navigation?.navigate("MainTabs", {
              screen: "Browse",
              params: {
                screen: "ListingDetail",
                params: { listingId: docRef.id },
              },
            }),
        },
        {
          text: "Close",
          style: "cancel",
          onPress: closeSellModal,
        },
      ]);
    } catch (error) {
      console.error("Error publishing mobile listing:", error);
      const isUploadError = error.message?.toLowerCase().includes("upload");
      setSubmitNotice(
        isUploadError
          ? `Failed to upload photos: ${error.message}`
          : `Failed to publish listing: ${error.message}`
      );
    } finally {
      setPublishing(false);
    }
  }

  function closeSellModal() {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation?.navigate?.("MainTabs", { screen: "Browse" });
  }

  function renderTitleBar() {
    return (
      <View style={styles.titleRow}>
        <ScreenTitle style={styles.pageTitle}>List Your Cube</ScreenTitle>
        <Pressable
          style={styles.closeButton}
          onPress={closeSellModal}
          accessibilityLabel="Close listing form"
        >
          <MaterialIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <Screen>
        <View style={styles.container}>
          {renderTitleBar()}
          <Text style={styles.emptyText}>Please sign in to create a listing</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container}>
          {renderTitleBar()}

          {submitNotice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{submitNotice}</Text>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Text style={styles.sectionHelper}>Add 1-5 photos*</Text>

              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <PhotoTile
                    key={photo.uri}
                    photo={photo}
                    index={index}
                    onRemove={removePhoto}
                  />
                ))}
                {photos.length < 5 && (
                  <Pressable
                    style={[
                      styles.addPhoto,
                      isPhotosInvalid && styles.addPhotoError,
                    ]}
                    onPress={pickPhotos}
                  >
                    <Text
                      style={[
                        styles.addPhotoIcon,
                        isPhotosInvalid && styles.addPhotoTextError,
                      ]}
                    >
                      ↑
                    </Text>
                    <Text
                      style={[
                        styles.addPhotoText,
                        isPhotosInvalid && styles.addPhotoTextError,
                      ]}
                    >
                      Upload
                    </Text>
                  </Pressable>
                )}
              </View>
              <HelperText error={isPhotosInvalid}>
                {isPhotosInvalid ? "Add at least one photo." : ""}
              </HelperText>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Basic Information</Text>

              <RequiredLabel>Title</RequiredLabel>
              <TextInput
                value={title}
                onChangeText={handleTitleChange}
                style={[styles.input, isTitleInvalid && styles.inputError]}
                placeholder="ex. Gan 16 Maglev UV"
                maxLength={INPUT_LIMITS.LISTING_TITLE}
              />
              <HelperText error={isTitleInvalid}>
                {isTitleInvalid ? "Enter a title." : ""}
              </HelperText>

              <View style={styles.inlineFields}>
                <View style={styles.priceField}>
                  <RequiredLabel>Price</RequiredLabel>
                  <TextInput
                    value={price}
                    onChangeText={handlePriceChange}
                    style={[styles.input, isPriceInvalid && styles.inputError]}
                    keyboardType="number-pad"
                    placeholder="0.00"
                  />
                  <HelperText error={isPriceInvalid}>
                    {isPriceInvalid
                      ? `Enter a price from $0 to $${INPUT_LIMITS.LISTING_PRICE_MAX.toLocaleString()}.`
                      : ""}
                  </HelperText>
                </View>
              </View>

              <SelectField
                label="Puzzle Type"
                required
                value={puzzleType}
                placeholder="Select puzzle type"
                error={isPuzzleTypeInvalid}
                helperText={isPuzzleTypeInvalid ? "Select a puzzle type." : ""}
                options={PUZZLE_TYPE_OPTIONS.map((option) => ({
                  value: option,
                  label: option,
                }))}
                onChange={(value) => {
                  clearSubmitNotice();
                  setPuzzleType(value);
                }}
              />

              <SelectField
                label="Condition"
                required
                value={condition}
                placeholder="Select condition"
                error={isConditionInvalid}
                helperText={isConditionInvalid ? "Select a condition." : ""}
                options={CONDITION_OPTIONS}
                onChange={(value) => {
                  clearSubmitNotice();
                  setCondition(value);
                }}
              />

              <RequiredLabel>Description</RequiredLabel>
              <TextInput
                value={description}
                onChangeText={handleDescriptionChange}
                style={[
                  styles.input,
                  styles.textArea,
                  isDescriptionInvalid && styles.inputError,
                ]}
                maxLength={INPUT_LIMITS.LISTING_DESCRIPTION}
                multiline
                placeholder="Describe your cube's condition, features, and any included accessories..."
                textAlignVertical="top"
              />
              <HelperText error={isDescriptionInvalid}>
                {isDescriptionInvalid
                  ? "Enter a description."
                  : characterCountText(
                      description,
                      INPUT_LIMITS.LISTING_DESCRIPTION
                    )}
              </HelperText>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Fulfillment Methods</Text>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Shipping</Text>
                <Toggle
                  value={shippingAvailable}
                  onValueChange={(value) => {
                    clearSubmitNotice();
                    setShippingAvailable(value);
                    if (!value) setShippingCost("0.00");
                  }}
                />
              </View>
              {shippingAvailable ? (
                <View style={styles.nestedSection}>
                  <RequiredLabel>Shipping Price</RequiredLabel>
                  <TextInput
                    value={shippingCost}
                    onChangeText={handleShippingCostChange}
                    style={[
                      styles.input,
                      styles.shippingInput,
                      isShippingCostValid ? null : styles.inputError,
                    ]}
                    keyboardType="number-pad"
                    placeholder="0.00"
                  />
                  <HelperText error={!isShippingCostValid && hasAttemptedSubmit}>
                    {!isShippingCostValid && hasAttemptedSubmit
                      ? `Enter a shipping price from $0 to $${INPUT_LIMITS.SHIPPING_COST_MAX}.`
                      : "Keep at $0 if there is no additional shipping cost."}
                  </HelperText>
                </View>
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Local Meetup</Text>
                <Toggle
                  value={localMeetupAvailable}
                  onValueChange={handleLocalMeetupChange}
                />
              </View>
              {localMeetupAvailable ? (
                <View style={styles.nestedSection}>
                  <RequiredLabel>General Meetup Area</RequiredLabel>
                  <TextInput
                    value={meetupLocationLabel}
                    onChangeText={(value) => {
                      clearSubmitNotice();
                      const nextValue = clampText(value, INPUT_LIMITS.LOCATION_LABEL);
                      setMeetupLocationLabel(nextValue);
                      setMeetupLocation(
                        nextValue === meetupLocation?.label ? meetupLocation : null
                      );
                    }}
                    style={[
                      styles.input,
                      hasAttemptedSubmit &&
                        !isMeetupLocationValid &&
                        styles.inputError,
                    ]}
                    placeholder="ex. Los Angeles, CA"
                  />
                  {loadingLocations ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.inlineLoader}
                    />
                  ) : null}
                  {locationOptions.length > 0 ? (
                    <View style={styles.optionList}>
                      {locationOptions.map((option) => {
                        const selected = meetupLocation?.label === option.label;
                        return (
                          <Pressable
                            key={option.label}
                            style={[
                              styles.inlineOption,
                              selected && styles.inlineOptionSelected,
                            ]}
                            onPress={() => {
                              clearSubmitNotice();
                              setMeetupLocation(option);
                              setMeetupLocationLabel(getLocationOptionLabel(option));
                              setLocationOptions([]);
                            }}
                          >
                            <Text
                              style={[
                                styles.inlineOptionText,
                                selected && styles.inlineOptionTextSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <HelperText error={hasAttemptedSubmit && !isMeetupLocationValid}>
                    {hasAttemptedSubmit && !isMeetupLocationValid
                      ? "Select a location from the list."
                      : ""}
                  </HelperText>
                </View>
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Competition Meetup</Text>
                <Toggle
                  value={competitionMeetupAvailable}
                  onValueChange={handleCompetitionMeetupChange}
                />
              </View>
              {competitionMeetupAvailable ? (
                <View style={styles.competitionSection}>
                  <RequiredLabel>Search competitions</RequiredLabel>
                  <TextInput
                    value={competitionSearchInput}
                    onChangeText={(value) => {
                      clearSubmitNotice();
                      setCompetitionSearchInput(value);
                    }}
                    style={[
                      styles.input,
                      hasAttemptedSubmit &&
                        !isCompetitionValid &&
                        styles.inputError,
                    ]}
                    placeholder="Search competitions..."
                  />
                  {loadingCompetitions ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.inlineLoader}
                    />
                  ) : null}
                  {selectedCompetitions.length > 0 ? (
                    <View style={styles.selectedCompetitionWrap}>
                      {selectedCompetitions.map((competition) => (
                        <Pressable
                          key={competition.id}
                          style={styles.selectedCompetitionPill}
                          onPress={() => handleCompetitionSelect(competition)}
                        >
                          <Text
                            style={styles.selectedCompetitionText}
                            numberOfLines={1}
                          >
                            {competition.displayName || competition.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.optionList}>
                    {competitionOptions.map((competition) => {
                      const selected = selectedCompetitionIds.has(competition.id);
                      return (
                        <Pressable
                          key={competition.id}
                          style={[
                            styles.competitionOption,
                            selected && styles.inlineOptionSelected,
                          ]}
                          onPress={() => handleCompetitionSelect(competition)}
                        >
                          <Text
                            style={[
                              styles.competitionOptionTitle,
                              selected && styles.inlineOptionTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {competition.displayName || competition.name}
                          </Text>
                          <Text style={styles.competitionOptionMeta} numberOfLines={1}>
                            {competition.isMyCompetitionsOption
                              ? `Add all ${bookmarkedCompetitions.length} bookmarked competitions`
                              : [competition.city, competition.country, competition.dateRange]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {competitions.length >= competitionLimit ? (
                    <Pressable
                      style={styles.loadMoreButton}
                      onPress={() =>
                        setCompetitionLimit(
                          (currentLimit) => currentLimit + COMPETITION_BATCH_SIZE
                        )
                      }
                    >
                      <Text style={styles.loadMoreText}>Load more competitions</Text>
                    </Pressable>
                  ) : null}
                  <HelperText error={hasAttemptedSubmit && !isCompetitionValid}>
                    {hasAttemptedSubmit && !isCompetitionValid
                      ? "Select at least one competition."
                      : ""}
                  </HelperText>
                </View>
              ) : null}

              {!isDeliveryValid && hasAttemptedSubmit ? (
                <HelperText error>
                  Please select at least one fulfillment method
                </HelperText>
              ) : null}
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.clearButton}
              onPress={clearListing}
              disabled={publishing}
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </Pressable>
            <Pressable
              style={[styles.publishButton, publishing && styles.publishButtonDisabled]}
              onPress={publishListing}
              disabled={publishing}
            >
              {publishing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publishButtonText}>Publish Listing</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 36,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  pageTitle: {
    flex: 1,
  },
  closeButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  notice: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  noticeText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "800",
  },
  formCard: {
  },
  section: {
    paddingVertical: 6,
  },
  sectionBorder: {
    borderColor: colors.border,
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 22,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  sectionHelper: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 16,
  },
  required: {
    color: colors.danger,
  },
  helper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  errorText: {
    color: colors.danger,
    fontWeight: "700",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputError: {
    borderColor: colors.danger,
  },
  selectInput: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  placeholderText: {
    color: colors.muted,
    fontWeight: "500",
  },
  selectChevron: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "900",
  },
  inlineFields: {
    flexDirection: "row",
    gap: 12,
  },
  priceField: {
    width: 118,
  },
  textArea: {
    minHeight: 118,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoTile: {
    backgroundColor: "#f1f5f9",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 94,
    overflow: "hidden",
    position: "relative",
    width: 94,
  },
  photo: {
    height: "100%",
    resizeMode: "contain",
    width: "100%",
  },
  removePhotoButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 24,
  },
  removePhotoText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20,
  },
  addPhoto: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 2,
    height: 94,
    justifyContent: "center",
    width: 94,
  },
  addPhotoError: {
    borderColor: colors.danger,
  },
  addPhotoIcon: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: "900",
  },
  addPhotoText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  addPhotoTextError: {
    color: colors.danger,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  nestedSection: {
    marginBottom: 12,
    marginTop: 2,
    paddingBottom: 4,
  },
  shippingInput: {
    width: 180,
  },
  inlineLoader: {
    alignSelf: "flex-start",
    marginTop: 10,
  },
  optionList: {
    gap: 8,
    marginTop: 10,
  },
  inlineOption: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineOptionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  inlineOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  inlineOptionTextSelected: {
    color: colors.primary,
  },
  competitionSection: {
    marginTop: 4,
  },
  selectedCompetitionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  selectedCompetitionPill: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedCompetitionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  competitionOption: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 11,
  },
  competitionOptionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  competitionOptionMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  loadMoreButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 10,
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 18,
  },
  clearButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  clearButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  publishButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  publishButtonDisabled: {
    opacity: 0.6,
  },
  publishButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  modalOverlay: {
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    flex: 1,
    justifyContent: "flex-end",
  },
  selectPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: "82%",
    padding: 18,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  closeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  selectOption: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  selectOptionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  selectOptionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  selectOptionTextSelected: {
    color: colors.primary,
  },
});
