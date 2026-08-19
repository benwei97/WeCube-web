import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export default function ClearableTextInput({
  clearAccessibilityLabel = "Clear text",
  onChangeText,
  style,
  value,
  wrapperStyle,
  ...props
}) {
  const hasValue = Boolean(String(value || "").length);

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        style={[style, styles.input]}
      />
      {hasValue ? (
        <Pressable
          accessibilityLabel={clearAccessibilityLabel}
          hitSlop={8}
          onPress={() => onChangeText?.("")}
          style={styles.clearButton}
        >
          <MaterialIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  input: {
    paddingRight: 38,
  },
  clearButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: "50%",
    transform: [{ translateY: -16 }],
    width: 32,
  },
});
