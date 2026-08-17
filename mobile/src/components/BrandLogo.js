import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { fontFamilies } from "../theme/design";

export default function BrandLogo({
  markHeight = 56,
  markWidth = 72,
  showWordmark = true,
  wordmarkSize = 28,
  style,
}) {
  const barHeight = markHeight * 0.26;
  const barWidth = markWidth * 0.78;
  const barOffset = markWidth - barWidth;
  const barGap = (markHeight - barHeight * 3) / 2;

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.mark, { height: markHeight, width: markWidth, gap: barGap }]}>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.text,
              borderRadius: barHeight / 2,
              height: barHeight,
              marginLeft: barOffset,
              width: barWidth,
            },
          ]}
        />
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.primary,
              borderRadius: barHeight / 2,
              height: barHeight,
              width: barWidth,
            },
          ]}
        />
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.text,
              borderRadius: barHeight / 2,
              height: barHeight,
              marginLeft: barOffset,
              width: barWidth,
            },
          ]}
        />
      </View>
      {showWordmark ? (
        <Text style={[styles.wordmark, { fontSize: wordmarkSize, lineHeight: wordmarkSize * 1.1 }]}>
          <Text style={styles.wordmarkInk}>we</Text>
          <Text style={styles.wordmarkBlue}>cube</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  mark: {
    justifyContent: "center",
  },
  bar: {
    flexShrink: 0,
  },
  wordmark: {
    fontFamily: fontFamilies.bold,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 8,
  },
  wordmarkInk: {
    color: colors.text,
  },
  wordmarkBlue: {
    color: colors.primary,
  },
});
