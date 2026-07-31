import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/useAuth";
import {
  REQUIRED_POLICY_VERSION,
  hasAcceptedCurrentPolicies,
} from "../constants/policies";
import { colors } from "../theme/colors";

export default function PolicyAcceptanceGate() {
  const { currentUser, logout } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const shouldShow = currentUser && !hasAcceptedCurrentPolicies(currentUser);

  async function handleAccept() {
    if (!currentUser?.uid || !accepted) return;

    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        acceptedPoliciesAt: new Date(),
        acceptedPolicyVersion: REQUIRED_POLICY_VERSION,
        acceptedTermsVersion: REQUIRED_POLICY_VERSION,
        acceptedPrivacyVersion: REQUIRED_POLICY_VERSION,
      });
    } catch (acceptError) {
      console.error("Error accepting mobile policies:", acceptError);
      setError("Unable to save your acceptance right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!shouldShow) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Review WeCube Policies</Text>
          <ScrollView style={styles.copyScroller}>
            <Text style={styles.body}>
              To continue using WeCube, agree to the current Terms & Conditions, Privacy Policy,
              and Safety Guidelines.
            </Text>
            <Text style={styles.sectionTitle}>Marketplace Safety</Text>
            <Text style={styles.body}>
              WeCube does not verify listings or handle payments. Review seller profiles, use
              trusted payment methods, meet in public places when possible, and do not share
              passwords, verification codes, full payment credentials, bank information, or other
              sensitive personal details in messages.
            </Text>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={styles.body}>
              You are responsible for the listings, messages, meetups, shipments, and transactions
              you choose to participate in. WeCube may moderate reports or unsafe activity to
              protect the community.
            </Text>
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
            <Text style={styles.body}>
              WeCube uses account, listing, message, review, report, and marketplace activity data
              to operate the app, support safety, prevent abuse, and improve reliability.
            </Text>
          </ScrollView>

          <Pressable
            style={styles.checkboxRow}
            onPress={() => setAccepted((prev) => !prev)}
            disabled={saving}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxText}>
              I agree to the Terms & Conditions, Privacy Policy, and Safety Guidelines.
            </Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={logout} disabled={saving}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!accepted || saving) && styles.primaryButtonDisabled]}
              onPress={handleAccept}
              disabled={!accepted || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    maxHeight: "86%",
    padding: 18,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "800",
  },
  copyScroller: {
    marginTop: 10,
    maxHeight: 330,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 14,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  checkboxRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  checkboxText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  secondaryButton: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
  },
});
