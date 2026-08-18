import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import Svg, { Path } from "react-native-svg";
import Screen from "../components/Screen";
import BrandLogo from "../components/BrandLogo";
import { useAuth } from "../contexts/useAuth";
import { colors } from "../theme/colors";
import { elevation, radii, typography } from "../theme/design";

WebBrowser.maybeCompleteAuthSession();

const NONCE_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";

function generateRandomNonce(length = 32) {
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes)
    .map((byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length])
    .join("");
}

function GoogleLogo({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </Svg>
  );
}

function getGoogleAuthErrorMessage(error) {
  if (error?.code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled in Firebase yet.";
  }

  if (error?.code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email. Sign in with email and password, then continue with Google next time.";
  }

  if (error?.code === "auth/unauthorized-domain") {
    return "This app domain is not authorized for Google sign-in in Firebase.";
  }

  if (error?.code === "auth/missing-google-token") {
    return "Google sign-in did not return a credential. Please try again.";
  }

  return error?.message || "Unable to sign in with Google right now. Please try again.";
}

function getAppleAuthErrorMessage(error) {
  if (error?.code === "ERR_REQUEST_CANCELED") {
    return null;
  }

  if (error?.code === "auth/operation-not-allowed") {
    return "Apple sign-in is not enabled in Firebase yet.";
  }

  if (error?.code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email. Sign in with email and password, then continue with Apple next time.";
  }

  if (error?.code === "auth/missing-apple-token") {
    return "Apple sign-in did not return a credential. Please try again.";
  }

  return error?.message || "Unable to sign in with Apple right now. Please try again.";
}

export default function AuthScreen() {
  const { login, signup, resetPassword, loginWithGoogle, loginWithApple } = useAuth();
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const handledGoogleResponseRef = useRef(null);

  const isSignup = mode === "signup";
  const isReset = mode === "reset";
  const isBusy = loading || googleLoading || appleLoading;
  const googleRedirectScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_SCHEME;
  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useIdTokenAuthRequest(
    {
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      selectAccount: true,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    },
    googleRedirectScheme ? { native: `${googleRedirectScheme}:/oauthredirect` } : undefined
  );

  useEffect(() => {
    let active = true;

    async function checkAppleAvailability() {
      if (Platform.OS !== "ios") {
        return;
      }

      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (active) {
          setAppleAvailable(available);
        }
      } catch (error) {
        console.error("Unable to check Apple sign-in availability:", error);
      }
    }

    checkAppleAvailability();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function completeGoogleAuth() {
      if (!googleResponse || handledGoogleResponseRef.current === googleResponse) {
        return;
      }

      handledGoogleResponseRef.current = googleResponse;

      if (googleResponse.type === "dismiss" || googleResponse.type === "cancel") {
        setGoogleLoading(false);
        return;
      }

      if (googleResponse.type !== "success") {
        setGoogleLoading(false);
        Alert.alert("Unable to sign in with Google", "Please try again.");
        return;
      }

      const idToken = googleResponse.params?.id_token || googleResponse.authentication?.idToken;
      const accessToken =
        googleResponse.params?.access_token || googleResponse.authentication?.accessToken;

      try {
        await loginWithGoogle(idToken, accessToken);
      } catch (error) {
        console.error("Mobile Google sign-in error:", error);
        Alert.alert("Unable to sign in with Google", getGoogleAuthErrorMessage(error));
      } finally {
        setGoogleLoading(false);
      }
    }

    completeGoogleAuth();
  }, [googleResponse, loginWithGoogle]);

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

    Alert.alert("Send reset link?", `Send a password reset email to ${normalizedEmail}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setLoading(true);
          try {
            await resetPassword(normalizedEmail);
            Alert.alert(
              "Reset email sent",
              "Check your email, including spam or junk, for a password reset link.",
              [{ text: "OK", onPress: () => setMode("login") }]
            );
          } catch (error) {
            Alert.alert("Unable to send reset", error.message || "Please try again.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  async function handleGoogleSignIn() {
    if (!googleRequest || isBusy) {
      return;
    }

    setGoogleLoading(true);

    try {
      await promptGoogleAuth();
    } catch (error) {
      console.error("Mobile Google prompt error:", error);
      setGoogleLoading(false);
      Alert.alert("Unable to sign in with Google", getGoogleAuthErrorMessage(error));
    }
  }

  async function handleAppleSignIn() {
    if (!appleAvailable || isBusy) {
      return;
    }

    setAppleLoading(true);

    try {
      const rawNonce = generateRandomNonce();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      await loginWithApple(credential.identityToken, rawNonce, {
        email: credential.email || "",
        firstName: credential.fullName?.givenName || "",
        lastName: credential.fullName?.familyName || "",
      });
    } catch (error) {
      const message = getAppleAuthErrorMessage(error);
      if (message) {
        console.error("Mobile Apple sign-in error:", error);
        Alert.alert("Unable to sign in with Apple", message);
      }
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <BrandLogo style={styles.logo} markHeight={66} markWidth={86} wordmarkSize={32} />
          <Text style={styles.title}>
            {isReset ? "Reset password" : isSignup ? "Create account" : "Sign in"}
          </Text>

          {!isReset && appleAvailable && (
            <View style={[styles.appleButtonWrap, isBusy && styles.buttonDisabled]}>
              {appleLoading ? (
                <View style={styles.appleLoadingButton}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  cornerRadius={8}
                  onPress={handleAppleSignIn}
                  style={styles.appleButton}
                />
              )}
            </View>
          )}

          {!isReset && (
            <>
              <Pressable
                style={[
                  styles.googleButton,
                  appleAvailable ? styles.googleButtonAfterApple : null,
                  isBusy && styles.buttonDisabled,
                ]}
                onPress={handleGoogleSignIn}
                disabled={!googleRequest || isBusy}
              >
                {googleLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <>
                    <GoogleLogo />
                    <Text style={styles.googleText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.segment}>
                <Pressable
                  style={[styles.segmentButton, !isSignup && styles.segmentActive]}
                  onPress={() => setMode("login")}
                  disabled={isBusy}
                >
                  <Text style={[styles.segmentText, !isSignup && styles.segmentTextActive]}>
                    Sign in
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentButton, isSignup && styles.segmentActive]}
                  onPress={() => setMode("signup")}
                  disabled={isBusy}
                >
                  <Text style={[styles.segmentText, isSignup && styles.segmentTextActive]}>
                    Sign up
                  </Text>
                </Pressable>
              </View>
            </>
          )}

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
            returnKeyType={isReset ? "send" : "next"}
            onSubmitEditing={isReset ? handleResetPassword : undefined}
          />
          {!isReset && (
            <TextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />
          )}
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
            style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
            onPress={isReset ? handleResetPassword : handleSubmit}
            disabled={isBusy}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {isReset ? "Send reset link" : isSignup ? "Create account" : "Sign in"}
              </Text>
            )}
          </Pressable>

          {!isSignup && !isReset && (
            <Pressable onPress={() => setMode("reset")} style={styles.linkButton} disabled={isBusy}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
          )}
          {isReset && (
            <Pressable onPress={() => setMode("login")} style={styles.linkButton} disabled={isBusy}>
              <Text style={styles.linkText}>Back to sign in</Text>
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
    borderRadius: radii.panel,
    borderWidth: 1,
    padding: 20,
    ...elevation.panel,
  },
  logo: {
    alignSelf: "center",
    marginBottom: 22,
  },
  title: {
    ...typography.screenTitle,
    color: colors.text,
    letterSpacing: 0,
  },
  appleButtonWrap: {
    marginTop: 20,
  },
  appleButton: {
    height: 48,
    width: "100%",
  },
  appleLoadingButton: {
    alignItems: "center",
    backgroundColor: "#000",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: "100%",
  },
  googleButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  googleButtonAfterApple: {
    marginTop: 10,
  },
  googleText: {
    ...typography.button,
    color: colors.text,
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.caption,
    color: colors.muted,
    textTransform: "uppercase",
  },
  segment: {
    backgroundColor: colors.softSurface,
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
    ...typography.caption,
    color: colors.muted,
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
    backgroundColor: colors.softSurface,
    borderColor: colors.border,
    borderRadius: radii.control,
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
    borderRadius: 8,
    marginTop: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryText: {
    ...typography.button,
    color: "#fff",
  },
  linkButton: {
    alignItems: "center",
    marginTop: 14,
  },
  linkText: {
    ...typography.button,
    color: colors.primary,
  },
});
