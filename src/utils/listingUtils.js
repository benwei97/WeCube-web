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
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "heavily-used", label: "Heavily Used" },
  { value: "used", label: "Used" },
];

export const SHIPPING_PROFILE_OPTIONS = [
  { value: "accessory_light", label: "Small accessory", price: 4.99 },
  { value: "single_cube_standard", label: "Single cube", price: 6.99 },
  { value: "large_cube_or_bundle", label: "Large cube / bundle", price: 9.99 },
  { value: "heavy_bundle", label: "Heavy bundle", price: 12.99 },
];

export function getShippingProfile(profileValue) {
  return (
    SHIPPING_PROFILE_OPTIONS.find((profile) => profile.value === profileValue) ||
    null
  );
}

export function getShippingPriceFromListing(listing = {}) {
  const profile = getShippingProfile(listing.shippingProfile);
  if (profile) {
    return profile.price;
  }

  return typeof listing.shippingCost === "number" ? listing.shippingCost : 0;
}

export function getShippingLabel(listing = {}, formatPrice) {
  if (listing.shippingIncluded) {
    return "Ships · Shipping Included";
  }

  const profile = getShippingProfile(listing.shippingProfile);
  if (profile) {
    return `Ships · ${profile.label} (${formatPrice(profile.price)})`;
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

export function getConditionLabel(conditionValue) {
  return (
    CONDITION_OPTIONS.find((option) => option.value === conditionValue)?.label ||
    conditionValue ||
    "N/A"
  );
}
