import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

export default function BackButton({ fallback, navigation, style }) {
  const canGoBack = navigation?.canGoBack?.();
  if (!canGoBack && !fallback) return null;

  return (
    <Pressable
      style={[styles.button, style]}
      onPress={() => {
        if (canGoBack) {
          navigation.goBack();
          return;
        }
        fallback();
      }}
      accessibilityLabel="Go back"
    >
      <Text style={styles.text}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    marginBottom: 12,
    width: 42,
  },
  text: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 36,
  },
});
