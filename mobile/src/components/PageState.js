import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import BrandLogo from "./BrandLogo";
import { colors } from "../theme/colors";
import { elevation, radii, typography } from "../theme/design";

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
        {isLoading ? (
          <>
            <BrandLogo style={styles.loadingLogo} markHeight={50} markWidth={66} wordmarkSize={26} />
            <ActivityIndicator color={colors.primary} style={styles.loadingSpinner} />
          </>
        ) : (
          <View style={styles.iconBox}>
            <BrandMark />
          </View>
        )}
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
    borderRadius: radii.panel,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 28,
    ...elevation.panel,
    width: "100%",
  },
  loadingLogo: {
    marginBottom: 12,
  },
  loadingSpinner: {
    marginBottom: 14,
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
    ...typography.sectionTitle,
    color: colors.text,
    letterSpacing: 0,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    color: colors.muted,
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
    ...typography.button,
    color: "#fff",
  },
});
