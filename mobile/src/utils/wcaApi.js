const WCA_API_BASE = "https://www.worldcubeassociation.org/api/v0";
const UNITED_STATES_COUNTRY_CODE = "US";
const WCA_PAGE_SIZE = 25;

let competitionCache = {
  data: null,
  timestamp: null,
};

const CACHE_DURATION = 60 * 60 * 1000;

function parseWcaDate(dateValue) {
  if (typeof dateValue === "string") {
    const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  return new Date(dateValue);
}

function formatDateRange(startDate, endDate) {
  const start = parseWcaDate(startDate);
  const end = parseWcaDate(endDate);

  if (Number.isNaN(start.getTime())) return "";

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (Number.isNaN(end.getTime()) || startDate === endDate) {
    return dateFormatter.format(start);
  }

  return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
}

function dedupeCompetitionsById(competitions) {
  const competitionsById = new Map();

  competitions.forEach((competition) => {
    if (competition?.id && !competitionsById.has(competition.id)) {
      competitionsById.set(competition.id, competition);
    }
  });

  return [...competitionsById.values()];
}

function formatCompetition(competition) {
  return {
    id: competition.id,
    name: competition.name,
    city: competition.city || "",
    country: competition.country_iso2 || "",
    latitude: competition.latitude_degrees,
    longitude: competition.longitude_degrees,
    startDate: competition.start_date,
    endDate: competition.end_date,
    venue: competition.venue || "",
    website: competition.website || competition.url || "",
    registrationOpen: competition.registration_open,
    registrationClose: competition.registration_close,
    displayName: `${competition.name} - ${competition.city || ""}, ${competition.country_iso2 || ""}`,
    dateRange: formatDateRange(competition.start_date, competition.end_date),
  };
}

function isCacheValid() {
  return (
    Array.isArray(competitionCache.data) &&
    competitionCache.timestamp &&
    Date.now() - competitionCache.timestamp < CACHE_DURATION
  );
}

async function fetchCompetitionPage(page, searchTerm = "") {
  const today = new Date().toISOString().split("T")[0];
  const params = new URLSearchParams({
    sort: "start_date",
    start: today,
    page: String(page),
  });

  if (searchTerm) {
    params.set("q", searchTerm);
  }

  const response = await fetch(`${WCA_API_BASE}/competitions?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Unable to load competitions.");
  }

  return response.json();
}

export async function getUpcomingCompetitions(limit = 50) {
  if (isCacheValid() && competitionCache.data.length >= limit) {
    return competitionCache.data.slice(0, limit);
  }

  const allCompetitions = [];
  let page = 1;

  while (allCompetitions.length < limit) {
    const pageCompetitions = await fetchCompetitionPage(page);
    allCompetitions.push(...pageCompetitions);

    if (pageCompetitions.length < WCA_PAGE_SIZE) break;
    page += 1;
  }

  const formattedCompetitions = dedupeCompetitionsById(allCompetitions)
    .filter((competition) => competition.country_iso2 === UNITED_STATES_COUNTRY_CODE)
    .map(formatCompetition)
    .sort((a, b) => parseWcaDate(a.startDate) - parseWcaDate(b.startDate));

  competitionCache = {
    data: formattedCompetitions,
    timestamp: Date.now(),
  };

  return formattedCompetitions.slice(0, limit);
}

export async function searchCompetitions(query, limit = 50) {
  const searchTerm = query.trim().toLowerCase();

  if (!searchTerm || searchTerm.length < 2) {
    return getUpcomingCompetitions(limit);
  }

  if (isCacheValid()) {
    const cachedMatches = competitionCache.data.filter(
      (competition) =>
        competition.name.toLowerCase().includes(searchTerm) ||
        competition.city.toLowerCase().includes(searchTerm) ||
        competition.country.toLowerCase().includes(searchTerm)
    );

    if (cachedMatches.length > 0 || searchTerm.length < 3) {
      return cachedMatches.slice(0, limit);
    }
  }

  const searchResults = await fetchCompetitionPage(1, searchTerm);
  const formattedResults = dedupeCompetitionsById(searchResults)
    .filter((competition) => competition.country_iso2 === UNITED_STATES_COUNTRY_CODE)
    .map(formatCompetition)
    .sort((a, b) => parseWcaDate(a.startDate) - parseWcaDate(b.startDate));

  return formattedResults.slice(0, limit);
}
