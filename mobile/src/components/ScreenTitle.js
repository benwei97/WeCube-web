import { StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";
import { typography } from "../theme/design";

export default function ScreenTitle({ children, style }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    ...typography.screenTitle,
    color: colors.text,
    marginTop: 4,
  },
});
