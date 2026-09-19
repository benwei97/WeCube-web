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
  "FTO",
  "Square-1",
  "Clock",
  "Lube",
  "Custom Mods",
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

export function parseNonNegativeCurrencyAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

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
  if (isCompetitionOnlyListingExpired(listing)) return false;
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
  const safeListing = listing || {};
  const seen = new Set();
  const meetupCompetitionTags = Array.isArray(safeListing.meetupCompetitionTags)
    ? safeListing.meetupCompetitionTags
    : [];
  const legacyCompetitions = Array.isArray(safeListing.competitions)
    ? safeListing.competitions
    : [];
  const legacyCompetitionsById = new Map(
    legacyCompetitions
      .filter((competition) => competition?.id)
      .map((competition) => [competition.id, competition])
  );
  const normalizeCompetitionTag = (competition = {}) => {
    const legacyCompetition = legacyCompetitionsById.get(competition.id) || {};

    return {
      ...legacyCompetition,
      ...competition,
      id: competition.id || legacyCompetition.id,
      name: competition.name || legacyCompetition.name,
      displayName:
        competition.displayName ||
        legacyCompetition.displayName ||
        competition.name ||
        legacyCompetition.name,
      city: competition.city || legacyCompetition.city,
      country: competition.country || legacyCompetition.country,
      dateRange: competition.dateRange || legacyCompetition.dateRange || "",
      startDate: competition.startDate || legacyCompetition.startDate || null,
      endDate: competition.endDate || legacyCompetition.endDate || null,
    };
  };

  return [...meetupCompetitionTags, ...legacyCompetitions]
    .filter((competition) => {
      if (!competition?.id || seen.has(competition.id)) return false;
      seen.add(competition.id);
      return true;
    })
    .map(normalizeCompetitionTag);
}

function getCompetitionLabel(competition = {}) {
  return competition.displayName || competition.name || "Competition meetup";
}

function getCompetitionEndDate(competition = {}) {
  const rawDate = competition.endDate || competition.startDate;
  if (!rawDate) {
    return null;
  }

  const date = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

export function isCompetitionPast(competition = {}, now = new Date()) {
  const endDate = getCompetitionEndDate(competition);
  return Boolean(endDate && endDate.getTime() < now.getTime());
}

export function getUpcomingCompetitionsFromList(competitions = [], now = new Date()) {
  return (Array.isArray(competitions) ? competitions : []).filter(
    (competition) => !isCompetitionPast(competition, now)
  );
}

export function getNormalizedFulfillmentFields(listing = {}) {
  const shippingCost = Number(listing.shippingCost || 0);
  const legacyDeliveryOptions = listing.deliveryOptions || {};

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
        : Boolean(legacyDeliveryOptions.meetup && getCompetitionTags(listing).length > 0),
    meetupLocationLabel: listing.meetupLocationLabel || listing.location || "",
    meetupCompetitionTags: getCompetitionTags(listing),
    shippingIncluded: Boolean(listing.shippingIncluded),
    shippingProfile: listing.shippingProfile || "",
    shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
  };
}

export function getActiveFulfillmentFields(listing = {}, now = new Date()) {
  const fulfillment = getNormalizedFulfillmentFields(listing);
  const upcomingCompetitionTags = getUpcomingCompetitionsFromList(
    fulfillment.meetupCompetitionTags,
    now
  );
  const competitionMeetupAvailable =
    fulfillment.competitionMeetupAvailable && upcomingCompetitionTags.length > 0;

  return {
    ...fulfillment,
    competitionMeetupAvailable,
    meetupCompetitionTags: upcomingCompetitionTags,
    hasExpiredCompetitionMeetups:
      fulfillment.competitionMeetupAvailable &&
      fulfillment.meetupCompetitionTags.length > upcomingCompetitionTags.length,
    hasAnyActiveFulfillment:
      fulfillment.localMeetupAvailable ||
      fulfillment.shippingAvailable ||
      competitionMeetupAvailable,
  };
}

export function isCompetitionOnlyListingExpired(listing = {}, now = new Date()) {
  const fulfillment = getActiveFulfillmentFields(listing, now);
  return (
    getNormalizedFulfillmentFields(listing).competitionMeetupAvailable &&
    !fulfillment.localMeetupAvailable &&
    !fulfillment.shippingAvailable &&
    !fulfillment.competitionMeetupAvailable
  );
}

export function getPrimaryFulfillmentLabel(listing = {}) {
  return getPrimaryFulfillmentOption(listing)?.label || "Fulfillment not set";
}

export function getPrimaryFulfillmentOption(listing = {}, options = {}) {
  const fulfillment = getActiveFulfillmentFields(listing);
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
      label: fulfillment.meetupLocationLabel || "Local meetup",
    };
  }

  if (fulfillment.competitionMeetupAvailable && competitionTags.length > 0) {
    const competition = competitionTags[0];
    const extraCompetitionCount = competitionTags.length - 1;
    return {
      type: "competition",
      label:
        extraCompetitionCount > 0
          ? `${getCompetitionLabel(competition)} +${extraCompetitionCount} more`
          : getCompetitionLabel(competition),
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

export function getLocationMatchInfo(listing = {}, filters = {}) {
  const selectedLocation = filters.locationOption;
  const selectedRadius = Number(filters.radiusMiles || 25);
  const includeLocalMeetups = filters.includeLocalMeetups !== false;
  const includeCompetitionMeetups = filters.includeCompetitionMeetups !== false;
  const includeShippableListings = filters.includeShippableListings !== false;
  const activeFulfillment = getActiveFulfillmentFields(listing);

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
    activeFulfillment.localMeetupAvailable &&
    localDistance !== null &&
    localDistance <= selectedRadius;

  const matchingCompetition = includeCompetitionMeetups
    ? activeFulfillment.meetupCompetitionTags.find((competition) => {
        const distance = getMilesBetweenLocations(selectedLocation, competition);
        return distance !== null && distance <= selectedRadius;
      })
    : null;

  return {
    matchesLocation: Boolean(matchesLocalMeetup || matchingCompetition),
    matchesShipping: Boolean(includeShippableListings && activeFulfillment.shippingAvailable),
    matchingCompetition: matchingCompetition || null,
  };
}

function getListingStatusScore(listing = {}) {
  if (listing.status === "sold") {
    return 0;
  }

  if (listing.status === "archived") {
    return 100;
  }

  return 1000;
}

function getListingRecencyScore(listing = {}, now = new Date()) {
  const createdAtMs = getDateTime(listing.createdAt);
  if (!createdAtMs) {
    return 0;
  }

  const ageInDays = Math.max(
    0,
    (now.getTime() - createdAtMs) / (24 * 60 * 60 * 1000)
  );

  if (ageInDays <= 1) {
    return 100;
  }

  if (ageInDays <= 7) {
    return 70;
  }

  if (ageInDays <= 30) {
    return 35;
  }

  return 10;
}

function getListingPhotoScore(listing = {}) {
  const photoCount = Array.isArray(listing.photos) ? listing.photos.length : 0;
  if (photoCount === 0) {
    return 0;
  }

  return photoCount > 1 ? 55 : 40;
}

function getListingFulfillmentScore(listing = {}) {
  const fulfillment = getActiveFulfillmentFields(listing);
  return [
    fulfillment.shippingAvailable ? 20 : 0,
    fulfillment.localMeetupAvailable ? 15 : 0,
    fulfillment.competitionMeetupAvailable ? 15 : 0,
  ].reduce((total, score) => total + score, 0);
}

function getListingPriceScore(listing = {}) {
  const price = Number(listing.price);
  if (!Number.isFinite(price) || price < 0) {
    return 0;
  }

  if (price <= 5) {
    return 30;
  }

  if (price <= 15) {
    return 25;
  }

  if (price <= 30) {
    return 18;
  }

  if (price <= 60) {
    return 10;
  }

  return 0;
}

function getListingQualityScore(listing = {}) {
  return listing.description?.trim() ? 10 : 0;
}

function getListingSellerScore(listing = {}) {
  const sellerReviewCount = Number(
    listing.sellerReviewCount ||
      listing.sellerStats?.reviewCount ||
      listing.sellerReviewsCount ||
      0
  );
  const sellerAverageRating = Number(
    listing.sellerAverageRating ||
      listing.sellerStats?.averageRating ||
      listing.sellerRating ||
      0
  );

  if (!Number.isFinite(sellerReviewCount) || sellerReviewCount <= 0) {
    return 0;
  }

  const reviewCountScore = Math.min(sellerReviewCount, 10);
  const ratingScore =
    Number.isFinite(sellerAverageRating) && sellerAverageRating > 0
      ? Math.min(sellerAverageRating, 5) * 2
      : 0;

  return Math.min(reviewCountScore + ratingScore, 20);
}

export function getRecommendedListingScore(listing = {}, now = new Date()) {
  return (
    getListingStatusScore(listing) +
    getListingRecencyScore(listing, now) +
    getListingPhotoScore(listing) +
    getListingFulfillmentScore(listing) +
    getListingPriceScore(listing) +
    getListingQualityScore(listing) +
    getListingSellerScore(listing)
  );
}

const RECOMMENDATION_SCORE_BAND_SIZE = 20;
const RECENTLY_SHOWN_RECOMMENDATION_PENALTY = 12;
const FRESH_ACTIVE_LISTING_SCORE_FLOOR = 1160;

function getRecommendationDayKey(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join("-");
}

function getDeterministicFraction(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function isFreshListing(listing = {}, now = new Date()) {
  const createdAtMs = getDateTime(listing.createdAt);
  if (!createdAtMs) return false;

  const ageInDays = Math.max(
    0,
    (now.getTime() - createdAtMs) / (24 * 60 * 60 * 1000)
  );
  return ageInDays <= 7;
}

/**
 * Keeps Recommended relevant while rotating similarly strong listings per viewer/day.
 * Explicit date and price sorts intentionally bypass these options.
 */
export function sortListingsByRecommended(listings = [], options = {}) {
  const now = options.now || new Date();
  const viewerSeed = options.viewerSeed || "wecube-guest";
  const dayKey = options.dayKey || getRecommendationDayKey(now);
  const recentlyShownListingIds = new Set(options.recentlyShownListingIds || []);

  return [...listings].sort((a, b) => {
    const getAdjustedScore = (listing) => {
      const hasRecentlyBeenShown = recentlyShownListingIds.has(listing.id);
      const freshActiveListing =
        listing.status === "active" && isFreshListing(listing, now);
      const exposurePenalty =
        hasRecentlyBeenShown && !freshActiveListing
          ? RECENTLY_SHOWN_RECOMMENDATION_PENALTY
          : 0;
      const baseScore = getRecommendedListingScore(listing, now);
      const protectedScore = freshActiveListing
        ? Math.max(baseScore, FRESH_ACTIVE_LISTING_SCORE_FLOOR)
        : baseScore;

      return protectedScore - exposurePenalty;
    };

    const aScore = getAdjustedScore(a);
    const bScore = getAdjustedScore(b);
    const aBand = Math.floor(aScore / RECOMMENDATION_SCORE_BAND_SIZE);
    const bBand = Math.floor(bScore / RECOMMENDATION_SCORE_BAND_SIZE);

    if (aBand !== bBand) {
      return bBand - aBand;
    }

    const aRotation = getDeterministicFraction(`${viewerSeed}:${dayKey}:${a.id}`);
    const bRotation = getDeterministicFraction(`${viewerSeed}:${dayKey}:${b.id}`);

    if (aRotation !== bRotation) {
      return bRotation - aRotation;
    }

    if (aScore !== bScore) {
      return bScore - aScore;
    }

    return getDateTime(b.createdAt) - getDateTime(a.createdAt);
  });
}
