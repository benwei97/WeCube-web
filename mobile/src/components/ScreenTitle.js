import { StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

export default function ScreenTitle({ children, style }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
});
