import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

function BrandMark() {
  return (
    <View style={styles.mark}>
      <View style={[styles.markBar, styles.markBarTop]} />
      <View style={[styles.markBar, styles.markBarMiddle]} />
      <View style={[styles.markBar, styles.markBarBottom]} />
    </View>
  );
}

export default function PageState({
  actionLabel,
  message,
  onAction,
  title = "Loading",
  variant = "default",
}) {
  const isLoading = variant === "loading";

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          {isLoading ? <ActivityIndicator color={colors.primary} /> : <BrandMark />}
        </View>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable style={styles.actionButton} onPress={onAction}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: "center",
    minHeight: 280,
    padding: 20,
  },
  card: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: "#1F3563",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    width: "100%",
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    marginBottom: 16,
    width: 48,
  },
  mark: {
    gap: 4,
    width: 26,
  },
  markBar: {
    borderRadius: 3,
    height: 5,
  },
  markBarTop: {
    backgroundColor: colors.text,
    marginLeft: 7,
  },
  markBarMiddle: {
    backgroundColor: colors.primary,
    marginRight: 7,
  },
  markBarBottom: {
    backgroundColor: colors.text,
    marginLeft: 7,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    textAlign: "center",
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  actionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
