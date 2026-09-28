import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  return <Screen>
    <FlatList
      contentContainerStyle={styles.content}
      data={currentUser?.isAdmin ? inbox.items : []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<>
        <BackButton navigation={navigation} />
        <Text style={styles.title} accessibilityRole="header">Feedback inbox</Text>
        {!currentUser?.isAdmin ? <Text>Admin access required.</Text> : <Options values={{ all: "All", ...FEEDBACK_STATUSES }} value={inbox.filter} onChange={inbox.setFilter} />}
        {inbox.error ? <><Text style={styles.error} accessibilityRole="alert">{inbox.error}</Text><Pressable accessibilityRole="button" onPress={inbox.retry} style={styles.option}><Text>Retry</Text></Pressable></> : null}
        {inbox.loading ? <ActivityIndicator color={colors.primary} /> : null}
      </>}
      ListEmptyComponent={!inbox.loading && !inbox.error && currentUser?.isAdmin ? <Text style={styles.muted}>No feedback in this view yet.</Text> : null}
      renderItem={({ item }) => <View style={styles.entry}>
        <Text style={styles.muted}>{FEEDBACK_CATEGORIES[item.category]} / {item.platform}</Text>
        <Text style={styles.subject}>{item.subject}</Text>
        <Text style={styles.muted}>{item.name} / {feedbackDate(item.createdAt)}</Text>
        <Text style={styles.muted}>Account: {item.userId}</Text>
        {item.version ? <Text style={styles.muted}>Version: {item.version}</Text> : null}
        <Text selectable style={styles.body}>{item.details}</Text>
        <Options values={FEEDBACK_STATUSES} value={item.status} onChange={(status) => inbox.updateStatus(item.id, status)} disabled={Boolean(inbox.saving)} />
      </View>}
      ListFooterComponent={inbox.hasMore && currentUser?.isAdmin ? <Pressable disabled={inbox.loading} accessibilityRole="button" onPress={inbox.loadMore} style={styles.option}><Text>Load older feedback</Text></Pressable> : null}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { ...typography.screenTitle, color: colors.text },
  subject: { ...typography.sectionTitle, color: colors.text },
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
  entry: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
});
