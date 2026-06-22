export const PUZZLE_TYPE_OPTIONS = [
  "2x2",
  "3x3",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "Pyraminx",
  "Skewb",
  "Megaminx",
  "Square-1",
  "Clock",
  "Accessories",
  "Bundles",
  "Other",
];

export const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like-new", label: "Like New" },
  { value: "used", label: "Used" },
];

const LEGACY_CONDITION_MAP = {
  excellent: "like-new",
  good: "used",
  fair: "used",
  "heavily-used": "used",
};

export const SHIPPING_PROFILE_OPTIONS = [
  { value: "accessory_light", label: "Small accessory", price: 4.99 },
  { value: "single_cube_standard", label: "Single cube", price: 6.99 },
  { value: "large_cube_or_bundle", label: "Large cube / bundle", price: 9.99 },
  { value: "heavy_bundle", label: "Heavy bundle", price: 12.99 },
];

export const SOLD_VISIBILITY_WINDOW_DAYS = 7;

export function getListingTimestampMs(timestampValue) {
  if (!timestampValue) {
    return 0;
  }

  if (typeof timestampValue?.toDate === "function") {
    return timestampValue.toDate().getTime();
  }

  const date = new Date(timestampValue);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function getShippingProfile(profileValue) {
  return (
    SHIPPING_PROFILE_OPTIONS.find((profile) => profile.value === profileValue) ||
    null
  );
}

export function getShippingPriceFromListing(listing = {}) {
  if (typeof listing.shippingCost === "number") {
    return listing.shippingCost;
  }

  const profile = getShippingProfile(listing.shippingProfile);
  if (profile) {
    return profile.price;
  }

  return 0;
}

export function parsePositiveCurrencyAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function getShippingLabel(listing = {}, formatPrice) {
  if (listing.shippingIncluded) {
    return "Ships · Shipping Included";
  }

  const shippingPrice = getShippingPriceFromListing(listing);
  if (shippingPrice > 0) {
    return `Ships · ${formatPrice(shippingPrice)} shipping`;
  }

  return "Ships";
}

export function getNormalizedFulfillmentFields(listing = {}) {
  const legacyDeliveryOptions = listing.deliveryOptions || {};
  const legacyCompetitions = Array.isArray(listing.competitions)
    ? listing.competitions
    : [];

  return {
    shippingAvailable:
      typeof listing.shippingAvailable === "boolean"
        ? listing.shippingAvailable
        : Boolean(legacyDeliveryOptions.shipping),
    localMeetupAvailable:
      typeof listing.localMeetupAvailable === "boolean"
        ? listing.localMeetupAvailable
        : false,
    competitionMeetupAvailable:
      typeof listing.competitionMeetupAvailable === "boolean"
        ? listing.competitionMeetupAvailable
        : Boolean(legacyDeliveryOptions.meetup && legacyCompetitions.length > 0),
    meetupLocationLabel: listing.meetupLocationLabel || listing.location || "",
    meetupCompetitionTags:
      Array.isArray(listing.meetupCompetitionTags) &&
      listing.meetupCompetitionTags.length > 0
        ? listing.meetupCompetitionTags
        : legacyCompetitions.map((competition) => ({
            id: competition.id,
            name: competition.name,
            displayName: competition.displayName || competition.name,
            dateRange: competition.dateRange || "",
          })),
    shippingIncluded: Boolean(listing.shippingIncluded),
    shippingProfile: listing.shippingProfile || "",
    shippingCost: getShippingPriceFromListing(listing),
  };
}

function getCompetitionLabel(competition = {}) {
  return competition.displayName || competition.name || "Competition meetup";
}

function formatLocalMeetupLabel(label = "") {
  return label.replace(/,\s*United States$/i, "").trim();
}

export function formatListedLocationLabel(location, fallbackLabel = "") {
  const city = location?.city?.trim();
  const region = location?.region?.trim();

  if (city && region) {
    return `${city}, ${region}`;
  }

  const label = formatLocalMeetupLabel(fallbackLabel);
  const [labelCity, labelRegion] = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (labelCity && labelRegion) {
    return `${labelCity}, ${labelRegion}`;
  }

  return label;
}

export function getListingCompetitionPayload(competition = {}, options = {}) {
  const payload = {
    id: competition.id || "",
    name: competition.name || "",
    city: competition.city || "",
    country: competition.country || competition.countryIso2 || "",
    latitude:
      typeof competition.latitude === "number" ? competition.latitude : null,
    longitude:
      typeof competition.longitude === "number" ? competition.longitude : null,
    displayName:
      competition.displayName || competition.name || "Competition meetup",
    dateRange: competition.dateRange || "",
  };

  if (options.includeSchedule) {
    payload.startDate = competition.startDate || null;
    payload.endDate = competition.endDate || null;
  }

  return payload;
}

export function getPrimaryFulfillmentOption(listing = {}, options = {}) {
  const fulfillment = getNormalizedFulfillmentFields(listing);
  const competitionTags = fulfillment.meetupCompetitionTags || [];

  if (options.preferShipping && fulfillment.shippingAvailable) {
    return {
      type: "shipping",
      label: "Ships to you",
    };
  }

  if (options.competitionId && fulfillment.competitionMeetupAvailable) {
    const matchingCompetition = competitionTags.find(
      (competition) => competition.id === options.competitionId
    );

    if (matchingCompetition) {
      return {
        type: "competition",
        label: getCompetitionLabel(matchingCompetition),
      };
    }
  }

  if (fulfillment.localMeetupAvailable) {
    return {
      type: "local",
      label: fulfillment.meetupLocationLabel
        ? formatLocalMeetupLabel(fulfillment.meetupLocationLabel)
        : "Local meetup",
    };
  }

  if (fulfillment.competitionMeetupAvailable && competitionTags.length > 0) {
    const firstCompetition = competitionTags[0];
    const extraCompetitionCount = competitionTags.length - 1;
    return {
      type: "competition",
      label:
        extraCompetitionCount > 0
          ? `${getCompetitionLabel(firstCompetition)} +${extraCompetitionCount} more`
          : getCompetitionLabel(firstCompetition),
    };
  }

  if (fulfillment.competitionMeetupAvailable) {
    return {
      type: "competition",
      label: "Competition meetup",
    };
  }

  if (fulfillment.shippingAvailable) {
    return {
      type: "shipping",
      label: "Ships to you",
    };
  }

  return null;
}

export function isSoldListingPubliclyVisible(listing = {}, now = new Date()) {
  if (listing.status !== "sold") {
    return true;
  }

  if (!listing.soldAt) {
    return true;
  }

  const soldDate = listing.soldAt.toDate
    ? listing.soldAt.toDate()
    : new Date(listing.soldAt);

  if (Number.isNaN(soldDate.getTime())) {
    return true;
  }

  const visibilityWindowMs = SOLD_VISIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - soldDate.getTime() <= visibilityWindowMs;
}

export function sortListingsByAvailabilityAndDate(listings = []) {
  return [...listings].sort((a, b) => {
    const aSold = a.status === "sold";
    const bSold = b.status === "sold";

    if (aSold !== bSold) {
      return aSold ? 1 : -1;
    }

    return getListingTimestampMs(b.createdAt) - getListingTimestampMs(a.createdAt);
  });
}

export function getConditionLabel(conditionValue) {
  const normalizedCondition = normalizeConditionValue(conditionValue);
  return (
    CONDITION_OPTIONS.find((option) => option.value === normalizedCondition)?.label ||
    normalizedCondition ||
    "N/A"
  );
}

export function normalizeConditionValue(conditionValue) {
  if (!conditionValue) {
    return "";
  }

  return LEGACY_CONDITION_MAP[conditionValue] || conditionValue;
}
