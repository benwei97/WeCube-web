import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { colors } from "../theme/colors";

export default function ProfileScreen() {
  const { currentUser, logout } = useAuth();
  const displayName = `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim();

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      Alert.alert("Unable to sign out", error.message || "Please try again.");
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase() || "W"}</Text>
        </View>
        <Text style={styles.name}>{displayName || "WeCube member"}</Text>
        {currentUser?.email ? <Text style={styles.email}>{currentUser.email}</Text> : null}

        <Pressable style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 24,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 14,
  },
  email: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: colors.danger,
    fontWeight: "800",
  },
});
