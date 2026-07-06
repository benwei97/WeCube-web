export const INPUT_LIMITS = {
  USER_NAME: 50,
  LISTING_TITLE: 80,
  LISTING_DESCRIPTION: 2000,
  MESSAGE_TEXT: 2000,
  REVIEW_COMMENT: 1000,
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

export function isCurrencyInputWithinLimit(value, maxAmount) {
  if (!/^[0-9]*\.?[0-9]{0,2}$/.test(value)) {
    return false;
  }

  if (value === "" || value === ".") {
    return true;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount <= maxAmount;
}
