import { useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { MaterialIcons } from "@expo/vector-icons";
import Screen from "../components/Screen";
import BackButton from "../components/BackButton";
import KeyboardForm from "../components/KeyboardForm";
import { useAuth } from "../contexts/useAuth";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, feedbackDate, useFeedbackForm, useFeedbackInbox } from "../hooks/useFeedback";
import { colors } from "../theme/colors";
import { typography } from "../theme/design";

function Options({ values, value, onChange, disabled }) {
  return <View style={styles.options} accessibilityRole="radiogroup">
    {Object.entries(values).map(([key, label]) => (
      <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: key === value, disabled }} disabled={disabled} onPress={() => onChange(key)} style={[styles.option, key === value && styles.selected]}>
        <Text style={styles.optionText}>{label}</Text>
      </Pressable>
    ))}
  </View>;
}

export default function FeedbackScreen({ navigation }) {
  const { currentUser } = useAuth();
  const version = `${Constants.expoConfig?.version || ""} (${Constants.nativeBuildVersion || "dev"})`;
  const form = useFeedbackForm(currentUser, Platform.OS, version);
  return <Screen>
    <KeyboardForm contentContainerStyle={styles.content}>
      <BackButton navigation={navigation} />
      <Text style={styles.title} accessibilityRole="header">Feedback</Text>
      <Text style={styles.muted}>Found a bug or have an idea? I'd love to hear it. - Ben</Text>
      {form.sent ? <>
        <Text style={styles.success} accessibilityLiveRegion="polite">Thanks! Your feedback is in my inbox.</Text>
        <Pressable style={styles.option} onPress={() => form.setSent(false)} accessibilityRole="button"><Text>Send more feedback</Text></Pressable>
      </> : <>
        <Options values={FEEDBACK_CATEGORIES} value={form.category} onChange={form.setCategory} disabled={form.busy} />
        <Text style={styles.label}>Subject</Text>
        <TextInput accessibilityLabel="Subject" style={styles.input} value={form.subject} onChangeText={form.setSubject} maxLength={120} editable={!form.busy} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
        <Text style={styles.label}>{form.category === "bug" ? "What happened?" : "Your feedback"}</Text>
        <TextInput accessibilityLabel="Feedback details" style={[styles.input, styles.details]} value={form.details} onChangeText={form.setDetails} maxLength={4000} multiline editable={!form.busy} placeholder={form.category === "bug" ? "What were you doing, and what went wrong?" : "What's on your mind?"} placeholderTextColor={colors.muted} />
        <Text style={styles.muted}>{form.details.length}/4000. Only WeCube admins can read this.</Text>
        {form.error ? <Text style={styles.error} accessibilityRole="alert">{form.error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!form.canSubmit} onPress={form.submit} style={[styles.send, !form.canSubmit && styles.disabled]}>
          {form.busy ? <ActivityIndicator color="white" /> : <MaterialIcons name="send" size={20} color="white" />}
          <Text style={styles.sendText}>{form.busy ? "Sending..." : "Send feedback"}</Text>
        </Pressable>
      </>}
    </KeyboardForm>
  </Screen>;
}

export function AdminFeedbackScreen({ navigation }) {
  const { currentUser } = useAuth();
  const inbox = useFeedbackInbox(currentUser?.isAdmin, currentUser?.uid);
  const [expandedId, setExpandedId] = useState(null);
  return <Screen>
    <FlatList
      contentContainerStyle={styles.inboxContent}
      extraData={{ expandedId, saving: inbox.saving }}
      data={currentUser?.isAdmin ? inbox.items : []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<View style={styles.inboxHeader}>
        <BackButton navigation={navigation} />
        <Text style={styles.title} accessibilityRole="header">Feedback inbox</Text>
        {!currentUser?.isAdmin ? <Text>Admin access required.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {Object.entries({ all: "All", ...FEEDBACK_STATUSES }).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: inbox.filter === value }} onPress={() => { inbox.setFilter(value); setExpandedId(null); }} style={[styles.tab, inbox.filter === value && styles.activeTab]}><Text style={[styles.tabText, inbox.filter === value && styles.activeTabText]}>{label}</Text></Pressable>)}
        </ScrollView>}
        {inbox.error ? <><Text style={styles.error} accessibilityRole="alert">{inbox.error}</Text><Pressable accessibilityRole="button" onPress={inbox.retry} style={styles.option}><Text>Retry</Text></Pressable></> : null}
        {inbox.loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>}
      ListEmptyComponent={!inbox.loading && !inbox.error && currentUser?.isAdmin ? <View style={styles.emptyInbox}><MaterialIcons name="inbox" size={32} color={colors.muted} /><Text style={styles.muted}>No feedback in this view yet.</Text></View> : null}
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        const statusColor = item.status === "resolved" ? colors.success : item.status === "in_progress" ? "#926000" : colors.primary;
        return <View style={styles.entry}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : item.id)} style={[styles.entrySummary, expanded && styles.expandedSummary]}>
            <View style={styles.entryMain}>
              <View style={styles.entryHeading}><Text style={styles.subject}>{item.subject}</Text><Text style={[styles.status, { color: statusColor, borderColor: statusColor }]}>{FEEDBACK_STATUSES[item.status]}</Text></View>
              {!expanded && <Text numberOfLines={1} style={styles.preview}>{item.details}</Text>}
              <Text style={styles.metadata}>{item.name} / {item.platform === "ios" ? "iOS" : item.platform === "android" ? "Android" : "Web"}</Text>
              <Text style={styles.metadata}>{feedbackDate(item.createdAt)}</Text>
            </View>
            <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={24} color={colors.muted} />
          </Pressable>
          {expanded && <View style={styles.entryDetails}>
            <Text style={styles.metadata}>{FEEDBACK_CATEGORIES[item.category]}</Text>
            <Text selectable style={styles.body}>{item.details}</Text>
            <Text selectable style={styles.metadata}>Account: {item.userId}</Text>
            {item.version ? <Text style={styles.metadata}>Version: {item.version}</Text> : null}
            <Text style={styles.statusLabel}>Submission status</Text>
            <Options values={FEEDBACK_STATUSES} value={item.status} onChange={(status) => inbox.updateStatus(item.id, status)} disabled={Boolean(inbox.saving)} />
          </View>}
        </View>;
      }}
      ListFooterComponent={inbox.hasMore && currentUser?.isAdmin ? <Pressable disabled={inbox.loading} accessibilityRole="button" onPress={inbox.loadMore} style={styles.option}><Text>Load older feedback</Text></Pressable> : null}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { ...typography.screenTitle, color: colors.text },
  subject: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  label: { ...typography.body, color: colors.text },
  body: { ...typography.body, color: colors.text, marginVertical: 12 },
  muted: { ...typography.body, color: colors.muted },
  error: { ...typography.body, color: colors.danger },
  success: { ...typography.body, color: colors.success },
  input: { ...typography.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, minHeight: 48 },
  details: { minHeight: 160, textAlignVertical: "top" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { padding: 12, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  optionText: { ...typography.body, color: colors.text },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  send: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  sendText: { ...typography.body, color: "white" },
  disabled: { opacity: 0.5 },
  inboxContent: { paddingHorizontal: 20, paddingBottom: 24 },
  inboxHeader: { paddingTop: 20, gap: 16 },
  tabs: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: colors.primary },
  tabText: { ...typography.bodyStrong, color: colors.muted },
  activeTabText: { color: colors.primary },
  entry: { borderBottomWidth: 1, borderBottomColor: colors.border },
  entrySummary: { flexDirection: "row", gap: 12, paddingVertical: 20, paddingHorizontal: 8, alignItems: "flex-start" },
  expandedSummary: { backgroundColor: colors.softSurface },
  entryMain: { flex: 1, minWidth: 0, gap: 4 },
  entryHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 4 },
  status: { ...typography.caption, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  preview: { ...typography.body, color: colors.muted, marginBottom: 4 },
  metadata: { ...typography.caption, color: colors.muted },
  entryDetails: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 24, gap: 4 },
  statusLabel: { ...typography.caption, color: colors.muted, marginTop: 16, marginBottom: 8 },
  emptyInbox: { alignItems: "center", gap: 12, paddingVertical: 64 },
});
