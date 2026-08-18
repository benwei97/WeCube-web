import { SafeAreaView } from "react-native-safe-area-context";
import { Keyboard, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { colors } from "../theme/colors";

export default function Screen({ children, style }) {
  return (
    <TouchableWithoutFeedback
      accessible={false}
      onPress={Keyboard.dismiss}
      touchSoundDisabled
    >
      <SafeAreaView style={[styles.screen, style]}>{children}</SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
