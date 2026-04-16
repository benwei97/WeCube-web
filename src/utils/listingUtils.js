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
    shippingCost:
      typeof listing.shippingCost === "number" ? listing.shippingCost : 0,
  };
}

export function getConditionLabel(conditionValue) {
  return (
    CONDITION_OPTIONS.find((option) => option.value === conditionValue)?.label ||
    conditionValue ||
    "N/A"
  );
}
