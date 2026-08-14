import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Screen from "../components/Screen";
import { useAuth } from "../contexts/useAuth";
import { colors } from "../theme/colors";
import logoMark from "../../assets/icon.png";

export default function AuthScreen() {
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }

    if (isSignup) {
      if (!firstName.trim() || !lastName.trim()) {
        Alert.alert("Missing name", "Enter your first and last name.");
        return;
      }

      if (password !== confirmPassword) {
        Alert.alert("Passwords do not match", "Confirm your password and try again.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignup) {
        await signup(normalizedEmail, password, firstName.trim(), lastName.trim());
        Alert.alert(
          "Verification sent",
          "Check your email, including spam or junk, then sign in after verifying."
        );
        setMode("login");
      } else {
        await login(normalizedEmail, password);
      }
    } catch (error) {
      Alert.alert("Unable to continue", error.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      Alert.alert("Enter email", "Enter your email first.");
      return;
    }

    try {
      await resetPassword(normalizedEmail);
      Alert.alert(
        "Reset email sent",
        "Check your email, including spam or junk, for a password reset link."
      );
    } catch (error) {
      Alert.alert("Unable to send reset", error.message || "Please try again.");
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <Image source={logoMark} style={styles.logo} />
          <Text style={styles.title}>{isSignup ? "Create account" : "Sign in"}</Text>
          <Text style={styles.subtitle}>
            Sign in before using WeCube.
          </Text>

          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentButton, !isSignup && styles.segmentActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.segmentText, !isSignup && styles.segmentTextActive]}>
                Sign in
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, isSignup && styles.segmentActive]}
              onPress={() => setMode("signup")}
            >
              <Text style={[styles.segmentText, isSignup && styles.segmentTextActive]}>
                Sign up
              </Text>
            </Pressable>
          </View>

          {isSignup && (
            <View style={styles.row}>
              <TextInput
                placeholder="First name"
                value={firstName}
                onChangeText={setFirstName}
                style={[styles.input, styles.rowInput]}
                autoCapitalize="words"
              />
              <TextInput
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
                style={[styles.input, styles.rowInput]}
                autoCapitalize="words"
              />
            </View>
          )}

          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
          />
          {isSignup && (
            <TextInput
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
              secureTextEntry
            />
          )}

          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{isSignup ? "Create account" : "Sign in"}</Text>
            )}
          </Pressable>

          {!isSignup && (
            <Pressable onPress={handleResetPassword} style={styles.linkButton}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  logo: {
    alignSelf: "center",
    borderRadius: 16,
    height: 64,
    marginBottom: 20,
    width: 64,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  segment: {
    backgroundColor: colors.background,
    borderRadius: 8,
    flexDirection: "row",
    marginTop: 18,
    padding: 3,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 10,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowInput: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  linkButton: {
    alignItems: "center",
    marginTop: 14,
  },
  linkText: {
    color: colors.primary,
    fontWeight: "700",
  },
});
