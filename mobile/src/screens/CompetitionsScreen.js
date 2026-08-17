import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import Screen from "../components/Screen";
import ScreenTitle from "../components/ScreenTitle";
import PageState from "../components/PageState";
import { useAuth } from "../contexts/useAuth";
import { db } from "../lib/firebase";
import { colors } from "../theme/colors";
import { radii, typography } from "../theme/design";
import { searchCompetitions } from "../utils/wcaApi";

const COMPETITION_BATCH_SIZE = 50;
const INITIAL_COMPETITION_LIMIT = 50;

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

function CompetitionRow({
  competition,
  saved,
  saving,
  onToggleSave,
  onOpen,
}) {
  return (
    <View style={styles.competitionRow}>
      <Pressable style={styles.competitionBody} onPress={() => onOpen(competition)}>
        <Text style={styles.competitionName} numberOfLines={1}>
          {competition.name}
        </Text>
        <Text style={styles.competitionMeta} numberOfLines={1}>
          {getCompetitionMeta(competition)}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.iconButton, saved && styles.iconButtonSaved]}
        onPress={() => onToggleSave(competition)}
        disabled={saving}
        accessibilityLabel={
          saved
            ? `Remove ${competition.name} from my competitions`
            : `Mark ${competition.name} as going`
        }
      >
        {saving ? (
          <Text style={styles.iconButtonText}>...</Text>
        ) : (
          <MaterialIcons
            name={saved ? "bookmark" : "bookmark-border"}
            size={21}
            color={saved ? colors.primary : colors.muted}
          />
        )}
      </Pressable>
      <Pressable style={styles.chevronButton} onPress={() => onOpen(competition)}>
        <Text style={styles.chevronText}>›</Text>
      </Pressable>
    </View>
  );
}

export default function CompetitionsScreen({ navigation }) {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [competitions, setCompetitions] = useState([]);
  const [competitionLimit, setCompetitionLimit] = useState(INITIAL_COMPETITION_LIMIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const savedCompetitions = useMemo(
    () =>
      Array.isArray(currentUser?.attendingCompetitions)
        ? currentUser.attendingCompetitions.filter((competition) => competition?.id)
        : [],
    [currentUser?.attendingCompetitions]
  );
  const savedCompetitionIds = useMemo(
    () => new Set(savedCompetitions.map((competition) => competition.id)),
    [savedCompetitions]
  );
  const displayedCompetitions = useMemo(() => {
    const pinnedSavedCompetitions = savedCompetitions.filter((competition) =>
      competitionMatchesSearch(competition, query)
    );
    const pinnedSavedCompetitionIds = new Set(
      pinnedSavedCompetitions.map((competition) => competition.id)
    );

    if (!pinnedSavedCompetitions.length) return competitions;

    return [
      ...pinnedSavedCompetitions,
      ...competitions.filter(
        (competition) => competition?.id && !pinnedSavedCompetitionIds.has(competition.id)
      ),
    ];
  }, [competitions, query, savedCompetitions]);

  useEffect(() => {
    setCompetitionLimit(INITIAL_COMPETITION_LIMIT);
  }, [query]);

  useEffect(() => {
    let active = true;
    const isInitialLoad = competitionLimit === INITIAL_COMPETITION_LIMIT;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError("");

    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCompetitions(query, competitionLimit);
        if (active) {
          setCompetitions(results);
          setLoading(false);
          setLoadingMore(false);
        }
      } catch (searchError) {
        console.error("Error loading mobile competitions:", searchError);
        if (active) {
          setError("Unable to load competitions.");
          setCompetitions([]);
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }, query.trim().length >= 2 ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [competitionLimit, query]);

  function openCompetitionListings(competition) {
    if (!competition?.id) return;
    navigation.navigate("CompetitionListings", {
      competitionId: competition.id,
      competition,
    });
  }

  function loadMoreCompetitions() {
    if (loading || loadingMore || query.trim().length >= 2) return;
    setCompetitionLimit((currentLimit) => currentLimit + COMPETITION_BATCH_SIZE);
  }

  function handleScroll(event) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const nearBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
    if (nearBottom) loadMoreCompetitions();
  }

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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        onScroll={handleScroll}
        scrollEventThrottle={120}
      >
        <ScreenTitle>Competitions</ScreenTitle>

        <View style={styles.section}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            placeholder="Search competitions..."
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading ? (
            <PageState
              variant="loading"
              title="Loading competitions"
            />
          ) : displayedCompetitions.length === 0 ? (
            <PageState
              title="No competitions found"
              message="Try a different competition or city."
            />
          ) : (
            <View style={styles.listStack}>
              {displayedCompetitions.map((competition) => (
                <CompetitionRow
                  key={competition.id}
                  competition={competition}
                  saved={savedCompetitionIds.has(competition.id)}
                  onToggleSave={handleToggleSavedCompetition}
                  onOpen={openCompetitionListings}
                  saving={savingId === competition.id}
                />
              ))}
            </View>
          )}

          {loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    gap: 22,
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    gap: 12,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  listStack: {
    gap: 10,
  },
  competitionRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
  },
  competitionBody: {
    flex: 1,
    minWidth: 0,
  },
  competitionName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  competitionMeta: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 4,
  },
  iconButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  iconButtonSaved: {
    backgroundColor: "#eff6ff",
    borderColor: colors.primary,
  },
  iconButtonText: {
    ...typography.caption,
    color: colors.muted,
  },
  chevronButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 22,
  },
  chevronText: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: "700",
  },
  centerState: {
    alignItems: "center",
    minHeight: 180,
    justifyContent: "center",
  },
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 32,
  },
  savedEmptyBlock: {
    padding: 16,
  },
  emptyTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
    marginTop: 6,
    textAlign: "center",
  },
  footerLoader: {
    alignItems: "center",
    paddingTop: 18,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
});
