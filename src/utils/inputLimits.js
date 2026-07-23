export const INPUT_LIMITS = {
  USER_NAME: 50,
  LISTING_TITLE: 80,
  LISTING_DESCRIPTION: 2000,
  MESSAGE_TEXT: 2000,
  REVIEW_COMMENT: 1000,
  REPORT_DETAILS: 1000,
  LOCATION_LABEL: 160,
  LISTING_PRICE_MAX: 9999.99,
  SHIPPING_COST_MAX: 999.99,
};

export function clampText(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

export function characterCountText(value, maxLength) {
  return `${String(value || "").length}/${maxLength}`;
}

export function formatCurrencyInputFromDigits(value, maxAmount) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const amountInCents = Number.parseInt(digits, 10);
  const maxAmountInCents = Math.round(maxAmount * 100);

  if (!Number.isFinite(amountInCents) || amountInCents > maxAmountInCents) {
    return null;
  }

  return (amountInCents / 100).toFixed(2);
}
