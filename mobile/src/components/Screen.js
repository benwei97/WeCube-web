import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export default function Screen({ children, edges = ["top", "left", "right"], style }) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
