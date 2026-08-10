import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

export default function BackButton({ navigation, style }) {
  if (!navigation?.canGoBack?.()) return null;

  return (
    <Pressable
      style={[styles.button, style]}
      onPress={() => navigation.goBack()}
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
