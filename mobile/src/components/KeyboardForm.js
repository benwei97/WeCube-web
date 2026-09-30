import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View,
} from "react-native";

// Only form surfaces use this layout; the chat library owns the main transcript.
export default function KeyboardForm({ children, contentContainerStyle, style }) {
  return (
    <KeyboardAvoidingView style={[styles.fill, style]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[contentContainerStyle, styles.content]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function KeyboardFormModalBody({ children, backdropStyle, cardStyle }) {
  const backdrop = StyleSheet.flatten(backdropStyle) || {};
  return (
    <KeyboardForm
      style={{ backgroundColor: backdrop.backgroundColor }}
      contentContainerStyle={[backdrop, { backgroundColor: "transparent" }]}
    >
      <View style={[cardStyle, { maxHeight: undefined }]}>{children}</View>
    </KeyboardForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: undefined, flexGrow: 1 },
});
