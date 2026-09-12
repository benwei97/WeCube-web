const WCA_API_BASE = "https://www.worldcubeassociation.org/api/v0";
const UNITED_STATES_COUNTRY_CODE = "US";
const WCA_PAGE_SIZE = 25;
export const DEFAULT_COMPETITION_LOAD_LIMIT = 50;

let competitionCache = {
  data: null,
  timestamp: null,
  isLoading: false,
  isLoadingMore: false,
  loadedPages: 0,
  hasLoadedAllPages: false,
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

async function waitForCompetitionCacheLimit(limit) {
  while (
    competitionCache.isLoadingMore &&
    (!competitionCache.data || competitionCache.data.length < limit)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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

function formatOfficialCompetitions(competitions = []) {
  return dedupeCompetitionsById(competitions)
    .filter((competition) => competition.country_iso2 === UNITED_STATES_COUNTRY_CODE)
    .map(formatCompetition)
    .sort((a, b) => parseWcaDate(a.startDate) - parseWcaDate(b.startDate));
}

function mergeCompetitionsIntoCache(competitions = []) {
  if (!competitions.length) return;

  const existingCompetitions = Array.isArray(competitionCache.data)
    ? competitionCache.data
    : [];
  const competitionsById = new Map(
    existingCompetitions.map((competition) => [competition.id, competition])
  );

  competitions.forEach((competition) => {
    if (competition?.id) {
      competitionsById.set(competition.id, competition);
    }
  });

  competitionCache = {
    ...competitionCache,
    data: [...competitionsById.values()]
      .filter((competition) => competition.country === UNITED_STATES_COUNTRY_CODE)
      .sort((a, b) => parseWcaDate(a.startDate) - parseWcaDate(b.startDate)),
    timestamp: competitionCache.timestamp || Date.now(),
  };
}

async function fetchCompetitionPagesUntilUsLimit({
  limit,
  searchTerm = "",
  startPage = 1,
}) {
  const allCompetitions = [];
  let page = startPage;
  let hasMorePages = true;
  const maxPages = 50;

  while (hasMorePages && page <= maxPages) {
    const pageCompetitions = await fetchCompetitionPage(page, searchTerm);
    allCompetitions.push(...pageCompetitions);

    const unitedStatesCompetitionCount = allCompetitions.filter(
      (competition) => competition.country_iso2 === UNITED_STATES_COUNTRY_CODE
    ).length;

    if (
      pageCompetitions.length < WCA_PAGE_SIZE ||
      unitedStatesCompetitionCount >= limit
    ) {
      hasMorePages = false;
    } else {
      page += 1;
    }
  }

  return {
    competitions: allCompetitions,
    loadedPages: page,
    hasLoadedAllPages: !hasMorePages,
  };
}

async function loadMoreUpcomingCompetitions(limit) {
  if (competitionCache.isLoadingMore) {
    await waitForCompetitionCacheLimit(limit);
    return competitionCache.data || [];
  }

  competitionCache.isLoadingMore = true;
  try {
    const result = await fetchCompetitionPagesUntilUsLimit({
      limit,
      startPage: Math.max(competitionCache.loadedPages + 1, 1),
    });
    mergeCompetitionsIntoCache(formatOfficialCompetitions(result.competitions));
    competitionCache.loadedPages = result.loadedPages;
    competitionCache.hasLoadedAllPages = result.hasLoadedAllPages;
    return competitionCache.data || [];
  } finally {
    competitionCache.isLoadingMore = false;
  }
}

export async function getUpcomingCompetitions(limit = DEFAULT_COMPETITION_LOAD_LIMIT) {
  if (isCacheValid()) {
    if (
      competitionCache.data.length < limit &&
      !competitionCache.hasLoadedAllPages
    ) {
      await loadMoreUpcomingCompetitions(limit);
    }

    return dedupeCompetitionsById(competitionCache.data || []).slice(0, limit);
  }

  if (competitionCache.isLoading) {
    while (competitionCache.isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return dedupeCompetitionsById(competitionCache.data || []).slice(0, limit);
  }

  competitionCache.isLoading = true;
  try {
    const result = await fetchCompetitionPagesUntilUsLimit({ limit });
    const formattedCompetitions = formatOfficialCompetitions(result.competitions);

    competitionCache = {
      data: formattedCompetitions,
      timestamp: Date.now(),
      isLoading: false,
      isLoadingMore: false,
      loadedPages: result.loadedPages,
      hasLoadedAllPages: result.hasLoadedAllPages,
    };

    return formattedCompetitions.slice(0, limit);
  } finally {
    competitionCache.isLoading = false;
  }
}

export async function searchCompetitions(query, limit = 50) {
  const searchTerm = query.trim().toLowerCase();

  if (!searchTerm || searchTerm.length < 2) {
    return getUpcomingCompetitions(limit);
  }

  const searchResults = await fetchCompetitionPagesUntilUsLimit({
    limit,
    searchTerm,
  });
  const formattedResults = formatOfficialCompetitions(searchResults.competitions);
  mergeCompetitionsIntoCache(formattedResults);

  return formattedResults.slice(0, limit);
}

export async function getCompetitionById(competitionId) {
  const response = await fetch(`${WCA_API_BASE}/competitions/${competitionId}`);
  if (!response.ok) {
    throw new Error("Unable to load competition.");
  }

  const competition = await response.json();
  if (competition.country_iso2 !== UNITED_STATES_COUNTRY_CODE) {
    throw new Error("Only United States competitions are available.");
  }

  return formatCompetition(competition);
}
