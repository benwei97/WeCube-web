import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { addDoc, collection } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { uploadImageAssetToS3 } from "../utils/s3";

const CONDITIONS = [
  { label: "New", value: "new" },
  { label: "Like new", value: "like-new" },
  { label: "Used", value: "used" },
];
const PUZZLE_TYPES = ["3x3", "2x2", "4x4", "5x5", "Pyraminx", "Megaminx", "Skewb", "Other"];

function SegmentOptions({ options, value, onChange }) {
  return (
    <View style={styles.segmentWrap}>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        const selected = value === optionValue;

        return (
          <Pressable
            key={optionValue}
            style={[styles.segmentOption, selected && styles.segmentOptionSelected]}
            onPress={() => onChange(optionValue)}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {optionLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SellScreen() {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("used");
  const [puzzleType, setPuzzleType] = useState("3x3");
  const [shippingAvailable, setShippingAvailable] = useState(true);
  const [shippingCost, setShippingCost] = useState("0.00");
  const [localMeetupAvailable, setLocalMeetupAvailable] = useState(false);
  const [meetupLocationLabel, setMeetupLocationLabel] = useState("");
  const [photos, setPhotos] = useState([]);
  const [publishing, setPublishing] = useState(false);

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
    setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
  }

  function removePhoto(uri) {
    setPhotos((prev) => prev.filter((photo) => photo.uri !== uri));
  }

  function parseCurrency(value) {
    const normalized = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : NaN;
  }

  function validateForm() {
    const parsedPrice = parseCurrency(price);
    const parsedShippingCost = shippingAvailable ? parseCurrency(shippingCost || "0") : 0;

    if (!title.trim()) return "Enter a title.";
    if (!description.trim()) return "Enter a description.";
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 9999.99) {
      return "Enter a valid price.";
    }
    if (!Number.isFinite(parsedShippingCost) || parsedShippingCost < 0 || parsedShippingCost > 999.99) {
      return "Enter a valid shipping price.";
    }
    if (!shippingAvailable && !localMeetupAvailable) {
      return "Select shipping or local meetup.";
    }
    if (localMeetupAvailable && !meetupLocationLabel.trim()) {
      return "Enter a meetup location.";
    }
    if (photos.length < 1) return "Add at least one photo.";

    return null;
  }

  async function publishListing() {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert("Check listing", validationError);
      return;
    }

    setPublishing(true);
    try {
      const listingId = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const uploadedPhotos = [];

      for (const photo of photos) {
        uploadedPhotos.push(await uploadImageAssetToS3(photo, listingId));
      }

      const parsedShippingCost = shippingAvailable ? parseCurrency(shippingCost || "0") : 0;
      const listingToSave = {
        title: title.trim(),
        price: parseCurrency(price),
        description: description.trim(),
        condition,
        puzzleType,
        meetupLocationLabel: localMeetupAvailable ? meetupLocationLabel.trim() : "",
        meetupLocation: null,
        photos: uploadedPhotos,
        shippingAvailable,
        shippingIncluded: shippingAvailable && parsedShippingCost === 0,
        shippingCost: parsedShippingCost,
        localMeetupAvailable,
        competitionMeetupAvailable: false,
        competitions: [],
        meetupCompetitionTags: [],
        status: "active",
        createdAt: new Date(),
        soldAt: null,
        userId: currentUser.uid,
        listingId,
      };

      await addDoc(collection(db, "listings"), listingToSave);
      setTitle("");
      setPrice("");
      setDescription("");
      setCondition("used");
      setPuzzleType("3x3");
      setShippingAvailable(true);
      setShippingCost("0.00");
      setLocalMeetupAvailable(false);
      setMeetupLocationLabel("");
      setPhotos([]);
      Alert.alert("Listing published", "Your listing is now active.");
    } catch (error) {
      console.error("Error publishing mobile listing:", error);
      Alert.alert("Unable to publish", error.message || "Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Sell a puzzle</Text>

          <Text style={styles.label}>Photos</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <Pressable key={photo.uri} onPress={() => removePhoto(photo.uri)}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
              </Pressable>
            ))}
            {photos.length < 5 && (
              <Pressable style={styles.addPhoto} onPress={pickPhotos}>
                <Text style={styles.addPhotoText}>Add photo</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.helper}>Tap a selected photo to remove it.</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} maxLength={80} />

          <Text style={styles.label}>Price</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />

          <Text style={styles.label}>Condition</Text>
          <SegmentOptions options={CONDITIONS} value={condition} onChange={setCondition} />

          <Text style={styles.label}>Puzzle type</Text>
          <SegmentOptions options={PUZZLE_TYPES} value={puzzleType} onChange={setPuzzleType} />

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textArea]}
            maxLength={2000}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Shipping</Text>
              <Text style={styles.helper}>Turn on if you can ship this puzzle.</Text>
            </View>
            <Switch value={shippingAvailable} onValueChange={setShippingAvailable} />
          </View>
          {shippingAvailable && (
            <>
              <Text style={styles.label}>Shipping price</Text>
              <TextInput
                value={shippingCost}
                onChangeText={setShippingCost}
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <Text style={styles.helper}>Keep at 0.00 if no additional shipping cost.</Text>
            </>
          )}

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Local meetup</Text>
              <Text style={styles.helper}>Use a public meetup location.</Text>
            </View>
            <Switch value={localMeetupAvailable} onValueChange={setLocalMeetupAvailable} />
          </View>
          {localMeetupAvailable && (
            <>
              <Text style={styles.label}>Meetup location</Text>
              <TextInput
                value={meetupLocationLabel}
                onChangeText={setMeetupLocationLabel}
                style={styles.input}
                placeholder="City, venue, or general area"
              />
            </>
          )}

          <Pressable
            style={[styles.primaryButton, publishing && styles.primaryButtonDisabled]}
            onPress={publishListing}
            disabled={publishing}
          >
            {publishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Publish listing</Text>
            )}
          </Pressable>
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
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 16,
  },
  helper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
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
  textArea: {
    minHeight: 120,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photo: {
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    height: 82,
    width: 82,
  },
  addPhoto: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 82,
    justifyContent: "center",
    width: 82,
  },
  addPhotoText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  segmentWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  segmentOption: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  segmentOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    color: colors.text,
    fontWeight: "700",
  },
  segmentTextSelected: {
    color: "#fff",
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 24,
    minHeight: 50,
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
