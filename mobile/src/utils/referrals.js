import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

const REFERRAL_STORAGE_KEY = "wecube:affiliateReferral";
const REFERRAL_PARAM_NAMES = ["ref", "affiliate", "affiliateCode"];
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeAffiliateCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function getReferralCodeFromUrl(url) {
  if (!url) return "";

  try {
    const parsedUrl = Linking.parse(url);
    for (const paramName of REFERRAL_PARAM_NAMES) {
      const code = normalizeAffiliateCode(parsedUrl.queryParams?.[paramName]);
      if (code) return code;
    }
  } catch (error) {
    console.error("Error parsing affiliate referral URL:", error);
  }

  return "";
}

export async function captureAffiliateReferralFromUrl(url) {
  const code = getReferralCodeFromUrl(url);
  if (!code) return null;

  const referral = {
    code,
    capturedAt: new Date().toISOString(),
    sourceUrl: url,
  };

  await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(referral));
  return referral;
}

export async function getPendingAffiliateReferral() {
  try {
    const referral = JSON.parse(
      (await AsyncStorage.getItem(REFERRAL_STORAGE_KEY)) || "null"
    );
    if (!referral?.code || !referral?.capturedAt) return null;

    const capturedAt = new Date(referral.capturedAt);
    if (
      Number.isNaN(capturedAt.getTime()) ||
      Date.now() - capturedAt.getTime() > REFERRAL_TTL_MS
    ) {
      await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }

    return referral;
  } catch (error) {
    console.error("Error reading mobile affiliate referral:", error);
    return null;
  }
}
