import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

export default function Toggle({ value, onValueChange, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      style={[
        styles.track,
        value && styles.trackOn,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.thumb, value && styles.thumbOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 44,
  },
  trackOn: {
    backgroundColor: "#dbeafe",
    borderColor: colors.primary,
  },
  thumb: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    width: 18,
  },
  thumbOn: {
    backgroundColor: colors.primary,
    transform: [{ translateX: 20 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
