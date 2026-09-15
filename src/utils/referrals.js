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

function getReferralCodeFromSearch(search) {
  const params = new URLSearchParams(search || "");
  for (const paramName of REFERRAL_PARAM_NAMES) {
    const code = normalizeAffiliateCode(params.get(paramName));
    if (code) return code;
  }
  return "";
}

export function captureAffiliateReferralFromUrl() {
  if (typeof window === "undefined") return null;

  const code = getReferralCodeFromSearch(window.location.search);
  if (!code) return null;

  const referral = {
    code,
    capturedAt: new Date().toISOString(),
    sourceUrl: window.location.href,
  };

  localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(referral));
  return referral;
}

export function getPendingAffiliateReferral() {
  if (typeof window === "undefined") return null;

  try {
    const referral = JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY) || "null");
    if (!referral?.code || !referral?.capturedAt) return null;

    const capturedAt = new Date(referral.capturedAt);
    if (
      Number.isNaN(capturedAt.getTime()) ||
      Date.now() - capturedAt.getTime() > REFERRAL_TTL_MS
    ) {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }

    return referral;
  } catch (error) {
    console.error("Error reading affiliate referral:", error);
    return null;
  }
}
