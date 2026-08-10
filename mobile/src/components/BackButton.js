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
      <Text style={styles.text}>{"<"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    marginBottom: 12,
    width: 34,
  },
  text: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22,
  },
});
