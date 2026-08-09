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

const SOLD_LISTING_VISIBILITY_DAYS = 7;
const EARTH_RADIUS_MILES = 3958.8;

export function formatListingPrice(price) {
  const numericPrice = Number(price || 0);
  if (numericPrice === 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numericPrice);
}

export function getDateTime(dateValue) {
  if (!dateValue) return 0;
  const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function getConditionLabel(condition) {
  return (
    CONDITION_OPTIONS.find((option) => option.value === condition)?.label ||
    condition ||
    ""
  );
}

export function isListingModerationHidden(listing = {}) {
  return listing.moderationStatus === "hidden" || Boolean(listing.hiddenAt);
}

export function shouldShowListingInMarketplace(listing = {}) {
  if (isListingModerationHidden(listing)) return false;
  if (listing.status === "active" || listing.status === "archived") return true;
  if (listing.status !== "sold") return false;

  const soldAtTime = getDateTime(listing.soldAt);
  if (!soldAtTime) return false;

  const visibleUntil =
    soldAtTime + SOLD_LISTING_VISIBILITY_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= visibleUntil;
}

export function sortListingsByAvailabilityAndDate(listings = []) {
  const statusOrder = {
    active: 0,
    archived: 1,
    sold: 2,
  };

  return [...listings].sort((a, b) => {
    const statusDifference =
      (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDifference !== 0) return statusDifference;
    return getDateTime(b.createdAt) - getDateTime(a.createdAt);
  });
}

export function getMilesBetweenLocations(firstLocation, secondLocation) {
  const firstLatitude = Number(firstLocation?.latitude);
  const firstLongitude = Number(firstLocation?.longitude);
  const secondLatitude = Number(secondLocation?.latitude);
  const secondLongitude = Number(secondLocation?.longitude);

  if (
    !Number.isFinite(firstLatitude) ||
    !Number.isFinite(firstLongitude) ||
    !Number.isFinite(secondLatitude) ||
    !Number.isFinite(secondLongitude)
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = toRadians(firstLatitude);
  const secondLatitudeRadians = toRadians(secondLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return (
    EARTH_RADIUS_MILES *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function getCompetitionTags(listing = {}) {
  const seen = new Set();
  return [...(listing.meetupCompetitionTags || []), ...(listing.competitions || [])]
    .filter((competition) => {
      if (!competition?.id || seen.has(competition.id)) return false;
      seen.add(competition.id);
      return true;
    });
}

export function getPrimaryFulfillmentLabel(listing = {}) {
  return getPrimaryFulfillmentOption(listing)?.label || "Fulfillment not set";
}

export function getPrimaryFulfillmentOption(listing = {}) {
  if (listing.shippingAvailable) {
    const shippingCost = Number(listing.shippingCost || 0);
    return {
      type: "shipping",
      icon: "↗",
      label: shippingCost > 0 ? "Ships to you" : "Free shipping",
      detail:
        shippingCost > 0
          ? `${formatListingPrice(shippingCost)} shipping`
          : "Shipping included",
    };
  }

  if (listing.localMeetupAvailable) {
    return {
      type: "local",
      icon: "⌖",
      label: listing.meetupLocationLabel || "Local meetup",
      detail: "Local meetup",
    };
  }

  if (listing.competitionMeetupAvailable) {
    const competition = getCompetitionTags(listing)[0];
    return {
      type: "competition",
      icon: "▣",
      label: competition?.displayName || competition?.name || "Competition meetup",
      detail: "Competition meetup",
    };
  }

  return null;
}

export function getLocationMatchInfo(listing = {}, filters = {}) {
  const selectedLocation = filters.locationOption;
  const selectedRadius = Number(filters.radiusMiles || 25);
  const includeLocalMeetups = filters.includeLocalMeetups !== false;
  const includeCompetitionMeetups = filters.includeCompetitionMeetups !== false;
  const includeShippableListings = filters.includeShippableListings !== false;

  if (!selectedLocation) {
    return {
      matchesLocation: true,
      matchesShipping: false,
      matchingCompetition: null,
    };
  }

  const localDistance = getMilesBetweenLocations(
    selectedLocation,
    listing.meetupLocation
  );
  const matchesLocalMeetup =
    includeLocalMeetups &&
    listing.localMeetupAvailable &&
    localDistance !== null &&
    localDistance <= selectedRadius;

  const matchingCompetition = includeCompetitionMeetups
    ? getCompetitionTags(listing).find((competition) => {
        const distance = getMilesBetweenLocations(selectedLocation, competition);
        return distance !== null && distance <= selectedRadius;
      })
    : null;

  return {
    matchesLocation: Boolean(matchesLocalMeetup || matchingCompetition),
    matchesShipping: Boolean(includeShippableListings && listing.shippingAvailable),
    matchingCompetition: matchingCompetition || null,
  };
}
