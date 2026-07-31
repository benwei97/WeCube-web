import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { searchCompetitions } from "../utils/wcaApi";

function getCompetitionMeta(competition) {
  return [competition.city, competition.country, competition.dateRange]
    .filter(Boolean)
    .join(" · ");
}

function getCompetitionForStorage(competition) {
  return {
    id: competition.id,
    name: competition.name,
    displayName: competition.displayName || competition.name,
    city: competition.city || "",
    country: competition.country || "",
    dateRange: competition.dateRange || "",
    startDate: competition.startDate || null,
    endDate: competition.endDate || null,
    latitude:
      typeof competition.latitude === "number" ? competition.latitude : null,
    longitude:
      typeof competition.longitude === "number" ? competition.longitude : null,
  };
}

function CompetitionRow({ competition, saved, saving, onToggleSave }) {
  return (
    <View style={styles.competitionRow}>
      <View style={styles.competitionInfo}>
        <Text style={styles.competitionName} numberOfLines={2}>
          {competition.name}
        </Text>
        <Text style={styles.competitionMeta} numberOfLines={2}>
          {getCompetitionMeta(competition)}
        </Text>
      </View>
      <Pressable
        style={[styles.bookmarkButton, saved && styles.bookmarkButtonSaved]}
        onPress={() => onToggleSave(competition)}
        disabled={saving}
      >
        <Text style={[styles.bookmarkText, saved && styles.bookmarkTextSaved]}>
          {saving ? "..." : saved ? "Saved" : "Save"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function CompetitionsScreen() {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  const savedCompetitions = useMemo(
    () => currentUser?.attendingCompetitions || [],
    [currentUser?.attendingCompetitions]
  );
  const savedCompetitionIds = useMemo(
    () => new Set(savedCompetitions.map((competition) => competition.id)),
    [savedCompetitions]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCompetitions(query, 50);
        if (active) {
          setCompetitions(results);
          setLoading(false);
        }
      } catch (searchError) {
        console.error("Error loading mobile competitions:", searchError);
        if (active) {
          setError("Unable to load competitions.");
          setCompetitions([]);
          setLoading(false);
        }
      }
    }, query.trim().length >= 2 ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query]);

  async function persistSavedCompetitions(nextCompetitions) {
    await updateDoc(doc(db, "users", currentUser.uid), {
      attendingCompetitions: nextCompetitions,
    });
  }

  async function handleToggleSavedCompetition(competition) {
    if (!currentUser?.uid) {
      Alert.alert("Sign in required", "Sign in to save competitions.");
      return;
    }

    if (savingId) return;

    const wasSaved = savedCompetitionIds.has(competition.id);
    const nextCompetitions = wasSaved
      ? savedCompetitions.filter((item) => item.id !== competition.id)
      : [...savedCompetitions, getCompetitionForStorage(competition)];

    setSavingId(competition.id);
    try {
      await persistSavedCompetitions(nextCompetitions);
    } catch (saveError) {
      console.error("Error saving mobile competitions:", saveError);
      Alert.alert("Unable to save", "Please try again.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Competitions</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search competitions"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {savedCompetitions.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.sectionTitle}>My competitions</Text>
            <FlatList
              data={savedCompetitions}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.savedPill}
                  onPress={() => handleToggleSavedCompetition(item)}
                >
                  <Text style={styles.savedPillText} numberOfLines={1}>
                    {item.displayName || item.name}
                  </Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.savedSeparator} />}
            />
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={competitions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CompetitionRow
                competition={item}
                saved={savedCompetitionIds.has(item.id)}
                onToggleSave={handleToggleSavedCompetition}
                saving={savingId === item.id}
              />
            )}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={styles.emptyTitle}>No competitions found</Text>
                <Text style={styles.emptyText}>Try a different competition or city.</Text>
              </View>
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  savedSection: {
    marginTop: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  savedPill: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  savedPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  savedSeparator: {
    width: 8,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  competitionRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  competitionInfo: {
    flex: 1,
  },
  competitionName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  competitionMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  bookmarkButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  bookmarkButtonSaved: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bookmarkText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  bookmarkTextSaved: {
    color: "#fff",
  },
  separator: {
    height: 10,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
  },
});
