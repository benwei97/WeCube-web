import { useEffect, useState } from "react";
import {
  Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export function KeyboardDismissButton() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!visible) return null;
  return (
    <View style={styles.toolbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
        onPress={Keyboard.dismiss}
        style={styles.dismissButton}
      >
        <MaterialIcons name="keyboard-hide" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

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
      <KeyboardDismissButton />
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
  toolbar: { backgroundColor: colors.surface, alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dismissButton: { minWidth: 48, minHeight: 44, alignItems: "center", justifyContent: "center", marginHorizontal: 12 },
});
