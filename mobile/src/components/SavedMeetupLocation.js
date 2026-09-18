import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/useAuth";
import { fetchLocationSuggestionOptions } from "../utils/locationSearch";
import { colors } from "../theme/colors";
import { typography } from "../theme/design";

export default function SavedMeetupLocation({ location, onUse, editable = false }) {
  const { currentUser } = useAuth();
  const saved = currentUser?.savedMeetupLocation;
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!editable || query.trim().length < 2 || query === selected?.label) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchLocationSuggestionOptions(query);
        if (active) setOptions(results);
      } catch {
        if (active) setNotice("Couldn't load locations. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [editable, query, selected]);

  async function save(value) {
    if (busy || !currentUser?.uid) return;
    setBusy(true);
    setNotice("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { savedMeetupLocation: value });
      setSelected(null);
      setQuery("");
    } catch {
      setNotice("Couldn't update your saved location. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function action(label, icon, onPress) {
    return <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={styles.action}><MaterialIcons name={icon} size={20} color={colors.primary} /><Text style={styles.actionText}>{label}</Text></Pressable>;
  }
  const candidate = editable ? selected : location;
  return (
    <View style={styles.container}>
      {editable && <Text style={styles.title}>Saved meetup location</Text>}
      {saved && <Text style={styles.caption}>Saved: {saved.label}</Text>}
      {editable && <TextInput style={styles.input} value={query} editable={!busy} placeholder="Search city or area" onChangeText={(value) => { setQuery(value); setSelected(null); setNotice(""); }} />}
      {loading && <ActivityIndicator color={colors.primary} />}
      {options.map((option) => <Pressable key={option.label} style={styles.option} onPress={() => { setSelected(option); setQuery(option.label); setOptions([]); }}><Text style={styles.caption}>{option.label}</Text></Pressable>)}
      <View style={styles.actions}>
        {saved && onUse && action("Use saved location", "bookmark", () => onUse(saved))}
        {candidate && candidate.label !== saved?.label && action(saved ? "Update saved location" : "Save as my meetup location", "bookmark", () => save(candidate))}
        {saved && action("Clear saved location", "close", () => save(null))}
      </View>
      {busy && <ActivityIndicator color={colors.primary} />}
      {notice && <Text accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginVertical: 12 },
  title: { ...typography.bodyStrong, color: colors.text },
  caption: { ...typography.caption, color: colors.muted },
  input: { ...typography.body, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text },
  option: { paddingVertical: 12, minHeight: 44 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, flexShrink: 1 },
  actionText: { ...typography.caption, color: colors.primary, flexShrink: 1 },
  error: { ...typography.caption, color: colors.danger },
});
