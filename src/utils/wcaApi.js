const WCA_API_BASE = 'https://www.worldcubeassociation.org/api/v0';
const COMPETITIONS_CACHE_STORAGE_KEY = 'wecube_competitions_cache_us_v1';
const WCA_PAGE_SIZE = 25;
export const DEFAULT_COMPETITION_LOAD_LIMIT = 50;
const UNITED_STATES_COUNTRY_CODE = 'US';
const CORS_PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://cors.sh/'
];

// Competition data cache with progressive loading support
let competitionCache = {
  data: null,
  timestamp: null,
  isLoading: false,
  isLoadingMore: false,
  totalPages: null,
  loadedPages: 0,
  hasLoadedAllPages: false
};

// Cache duration: 1 hour (3600000 ms)
const CACHE_DURATION = 60 * 60 * 1000;

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStoredCompetitionCache() {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawCache = window.localStorage.getItem(COMPETITIONS_CACHE_STORAGE_KEY);
    if (!rawCache) {
      return null;
    }

    const parsedCache = JSON.parse(rawCache);
    if (!Array.isArray(parsedCache.data) || !parsedCache.timestamp) {
      return null;
    }

    return parsedCache;
  } catch (error) {
    console.warn('Unable to read stored competition cache:', error);
    return null;
  }
}

function writeStoredCompetitionCache() {
  if (!canUseLocalStorage() || !Array.isArray(competitionCache.data)) {
    return;
  }

  try {
    window.localStorage.setItem(
      COMPETITIONS_CACHE_STORAGE_KEY,
      JSON.stringify({
        data: competitionCache.data,
        timestamp: competitionCache.timestamp,
        loadedPages: competitionCache.loadedPages,
        totalPages: competitionCache.totalPages,
        hasLoadedAllPages: competitionCache.hasLoadedAllPages,
      })
    );
  } catch (error) {
    console.warn('Unable to write stored competition cache:', error);
  }
}

function mergeCompetitionsIntoCache(competitions) {
  if (!Array.isArray(competitions) || competitions.length === 0) {
    return;
  }

  const existingCompetitions = Array.isArray(competitionCache.data)
    ? competitionCache.data
    : [];
  const competitionsById = new Map(
    existingCompetitions.map((competition) => [competition.id, competition])
  );

  competitions.forEach((competition) => {
    competitionsById.set(competition.id, competition);
  });

  competitionCache = {
    ...competitionCache,
    data: [...competitionsById.values()]
      .filter(isUnitedStatesFormattedCompetition)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate)),
    timestamp: competitionCache.timestamp || Date.now(),
  };
  writeStoredCompetitionCache();
}

function dedupeCompetitionsById(competitions) {
  if (!Array.isArray(competitions)) {
    return [];
  }

  const competitionsById = new Map();

  competitions.forEach((competition) => {
    if (!competition?.id || competitionsById.has(competition.id)) {
      return;
    }

    competitionsById.set(competition.id, competition);
  });

  return [...competitionsById.values()];
}

function isUnitedStatesOfficialCompetition(competition) {
  return competition?.country_iso2 === UNITED_STATES_COUNTRY_CODE;
}

function isUnitedStatesFormattedCompetition(competition) {
  return competition?.country === UNITED_STATES_COUNTRY_CODE;
}

function hydrateMemoryCacheFromStorage() {
  const storedCache = readStoredCompetitionCache();
  if (
    !storedCache ||
    Date.now() - storedCache.timestamp >= CACHE_DURATION
  ) {
    return false;
  }

  competitionCache = {
    data: storedCache.data,
    timestamp: storedCache.timestamp,
    isLoading: false,
    isLoadingMore: false,
    totalPages: storedCache.totalPages || null,
    loadedPages: storedCache.loadedPages || Math.ceil(storedCache.data.length / WCA_PAGE_SIZE),
    hasLoadedAllPages: Boolean(storedCache.hasLoadedAllPages),
  };

  return true;
}

async function waitForCompetitionCacheLimit(limit) {
  while (
    competitionCache.isLoadingMore &&
    (!competitionCache.data || competitionCache.data.length < limit)
  ) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Check if cached data is still valid
 */
function isCacheValid() {
  return competitionCache.data &&
         competitionCache.timestamp &&
         (Date.now() - competitionCache.timestamp) < CACHE_DURATION;
}

/**
 * Fetch competitions from API and cache the result
 */
async function fetchAndCacheCompetitions(initialLimit = DEFAULT_COMPETITION_LOAD_LIMIT) {
  const today = new Date().toISOString().split('T')[0];

  console.log(`Fetching initial competition data from WCA API (${today} onward)...`);

  // Try direct API first (will work in production)
  try {
    const result = await fetchInitialCompetitionPages(today, false, null, initialLimit);
    if (result.competitions.length > 0) {
      const formattedCompetitions = formatOfficialCompetitions(result.competitions);

      // Cache the initial data
      competitionCache = {
        data: formattedCompetitions,
        timestamp: Date.now(),
        isLoading: false,
        isLoadingMore: false,
        totalPages: result.totalPages,
        loadedPages: result.loadedPages,
        hasLoadedAllPages: !result.hasMorePages,
      };
      writeStoredCompetitionCache();

      console.log(`Cached initial ${formattedCompetitions.length} competitions from ${result.loadedPages} pages`);

      // Start loading more pages in background if there are more
      if (result.hasMorePages) {
        loadMorePagesInBackground(today, false, result.loadedPages + 1);
      }

      return formattedCompetitions;
    }
  } catch (error) {
    console.warn('Direct API failed due to CORS:', error.message);
  }

  // Try CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      console.log(`Trying CORS proxy: ${proxy}`);
      const result = await fetchInitialCompetitionPages(today, proxy, null, initialLimit);

      if (result.competitions.length > 0) {
        console.log('Successfully fetched from CORS proxy');
        const formattedCompetitions = formatOfficialCompetitions(result.competitions);

        // Cache the initial data
        competitionCache = {
          data: formattedCompetitions,
          timestamp: Date.now(),
          isLoading: false,
          isLoadingMore: false,
          totalPages: result.totalPages,
          loadedPages: result.loadedPages,
          hasLoadedAllPages: !result.hasMorePages,
        };
        writeStoredCompetitionCache();

        console.log(`Cached initial ${formattedCompetitions.length} competitions from ${result.loadedPages} pages`);

        // Start loading more pages in background if there are more
        if (result.hasMorePages) {
          loadMorePagesInBackground(today, proxy, result.loadedPages + 1);
        }

        return formattedCompetitions;
      }
    } catch (proxyError) {
      console.warn(`CORS proxy ${proxy} failed:`, proxyError.message);
    }
  }

  console.error('All API methods failed to fetch competitions');
  throw new Error('Unable to fetch competitions. Please check your internet connection or try again later.');
}

/**
 * Fetch the minimum initial pages needed for quick loading
 */
async function fetchInitialCompetitionPages(
  startDate,
  proxy = false,
  searchQuery = null,
  initialLimit = DEFAULT_COMPETITION_LOAD_LIMIT
) {
  let allCompetitions = [];
  let page = 1;
  const maxInitialPages = 50;

  while (page <= maxInitialPages) {
    try {
      let baseUrl = `${WCA_API_BASE}/competitions?sort=start_date&start=${startDate}&page=${page}`;

      // Add search query if provided
      if (searchQuery) {
        baseUrl += `&q=${encodeURIComponent(searchQuery)}`;
      }

      let response, data;

      if (proxy) {
        if (proxy.includes('allorigins.win')) {
          const proxyUrl = `${proxy}${encodeURIComponent(baseUrl)}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            const result = await response.json();
            data = JSON.parse(result.contents);
          }
        } else {
          const proxyUrl = `${proxy}${baseUrl}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            data = await response.json();
          }
        }
      } else {
        response = await fetch(baseUrl);
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data && Array.isArray(data)) {
        console.log(`Fetched initial page ${page}: ${data.length} competitions`);
        allCompetitions = allCompetitions.concat(data);
        const unitedStatesCompetitionCount = allCompetitions.filter(
          isUnitedStatesOfficialCompetition
        ).length;

        // If we got fewer than 25 competitions, we're done.
        if (
          data.length < WCA_PAGE_SIZE ||
          unitedStatesCompetitionCount >= initialLimit
        ) {
          break;
        }
        page++;
      } else {
        break;
      }
    } catch (error) {
      console.error(`Error fetching initial page ${page}:`, error);
      break;
    }
  }

  console.log(`Initial load complete: ${allCompetitions.length} competitions from ${page - 1} pages`);

  return {
    competitions: allCompetitions,
    loadedPages: page - 1,
    hasMorePages: allCompetitions.length > 0 && allCompetitions.length % WCA_PAGE_SIZE === 0,
    totalPages: null // We don't know total pages yet
  };
}

/**
 * Load more pages in the background
 */
async function loadMorePagesInBackground(
  startDate,
  proxy = false,
  startPage = 5,
  targetLimit = null
) {
  if (competitionCache.isLoadingMore) {
    return; // Already loading more
  }

  competitionCache.isLoadingMore = true;
  console.log(`Starting background loading from page ${startPage}...`);

  let page = startPage;
  let hasMorePages = true;

  while (
    hasMorePages &&
    page <= 50 &&
    (!targetLimit || !competitionCache.data || competitionCache.data.length < targetLimit)
  ) { // Safety limit
    try {
      let baseUrl = `${WCA_API_BASE}/competitions?sort=start_date&start=${startDate}&page=${page}`;
      let response, data;

      if (proxy) {
        if (proxy.includes('allorigins.win')) {
          const proxyUrl = `${proxy}${encodeURIComponent(baseUrl)}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            const result = await response.json();
            data = JSON.parse(result.contents);
          }
        } else {
          const proxyUrl = `${proxy}${baseUrl}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            data = await response.json();
          }
        }
      } else {
        response = await fetch(baseUrl);
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`Background loaded page ${page}: ${data.length} competitions`);

        // Add new competitions to cache
        const newFormattedCompetitions = formatOfficialCompetitions(data);
        competitionCache.data = dedupeCompetitionsById(
          competitionCache.data.concat(newFormattedCompetitions)
        );
        competitionCache.loadedPages = page;
        writeStoredCompetitionCache();

        console.log(`Total cached competitions now: ${competitionCache.data.length}`);

        // If we got fewer than 25 competitions, we're done
        if (data.length < WCA_PAGE_SIZE) {
          hasMorePages = false;
        } else {
          page++;
        }

        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        hasMorePages = false;
        competitionCache.hasLoadedAllPages = true;
      }
    } catch (error) {
      console.error(`Error background loading page ${page}:`, error);
      hasMorePages = false;
    }
  }

  competitionCache.isLoadingMore = false;
  if (!hasMorePages || page > 50) {
    competitionCache.hasLoadedAllPages = true;
    writeStoredCompetitionCache();
  }
  console.log(`Background loading complete. Total competitions: ${competitionCache.data.length}`);
}

/**
 * Fetch all competition pages with pagination (for search)
 */
async function fetchAllCompetitionPages(startDate, proxy = false, searchQuery = null) {
  let allCompetitions = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      let baseUrl = `${WCA_API_BASE}/competitions?sort=start_date&start=${startDate}&page=${page}`;

      // Add search query if provided
      if (searchQuery) {
        baseUrl += `&q=${encodeURIComponent(searchQuery)}`;
      }

      let response, data;

      if (proxy) {
        if (proxy.includes('allorigins.win')) {
          const proxyUrl = `${proxy}${encodeURIComponent(baseUrl)}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            const result = await response.json();
            data = JSON.parse(result.contents);
          }
        } else {
          const proxyUrl = `${proxy}${baseUrl}`;
          response = await fetch(proxyUrl);
          if (response.ok) {
            data = await response.json();
          }
        }
      } else {
        response = await fetch(baseUrl);
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data && Array.isArray(data)) {
        console.log(`Fetched page ${page}: ${data.length} competitions`);
        allCompetitions = allCompetitions.concat(data);

        // If we got fewer than 25 competitions (typical page size), we're done
        if (data.length < WCA_PAGE_SIZE) {
          hasMorePages = false;
        } else {
          page++;
        }

        // Safety limit to prevent infinite loops
        if (page > 50) {
          console.warn('Reached maximum page limit (50), stopping pagination');
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      hasMorePages = false;
    }
  }

  console.log(`Total competitions fetched: ${allCompetitions.length} across ${page - 1} pages`);
  return allCompetitions;
}

/**
 * Fetch upcoming competitions from official WCA API with caching
 */
export async function getUpcomingCompetitions(limit = 50) {
  // Check if we have valid cached data
  if (isCacheValid() || hydrateMemoryCacheFromStorage()) {
    console.log('Using cached competition data');
    if (
      competitionCache.data.length < limit &&
      !competitionCache.hasLoadedAllPages
    ) {
      if (competitionCache.isLoadingMore) {
        await waitForCompetitionCacheLimit(limit);
      } else {
        const today = new Date().toISOString().split('T')[0];
        await loadMorePagesInBackground(
          today,
          false,
          competitionCache.loadedPages + 1,
          limit
        );
      }
    }
    return dedupeCompetitionsById(competitionCache.data).slice(0, limit);
  }

  // If already loading, wait for the current request
  if (competitionCache.isLoading) {
    console.log('Competition data is already being fetched, waiting...');
    // Wait for loading to complete by polling every 100ms
    while (competitionCache.isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (competitionCache.data) {
      return dedupeCompetitionsById(competitionCache.data).slice(0, limit);
    }
  }

  // Mark as loading and fetch new data
  competitionCache.isLoading = true;

  try {
    const competitions = await fetchAndCacheCompetitions(limit);
    return dedupeCompetitionsById(competitions).slice(0, limit);
  } catch (error) {
    competitionCache.isLoading = false;
    throw error;
  }
}

/**
 * Format official WCA API competitions data
 */
function formatOfficialCompetitions(competitions) {
  console.log('Formatting competitions, received:', competitions.length, 'competitions');

  const result = dedupeCompetitionsById(competitions)
    .filter(isUnitedStatesOfficialCompetition)
    .map(comp => ({
      id: comp.id,
      name: comp.name,
      city: comp.city,
      country: comp.country_iso2,
      latitude: comp.latitude_degrees,
      longitude: comp.longitude_degrees,
      startDate: comp.start_date,
      endDate: comp.end_date,
      venue: comp.venue || '',
      website: comp.website || comp.url || '',
      registrationOpen: comp.registration_open,
      registrationClose: comp.registration_close,
      displayName: `${comp.name} - ${comp.city}, ${comp.country_iso2}`,
      dateRange: formatDateRange(comp.start_date, comp.end_date)
    }))
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  console.log('After formatting:', result.length, 'competitions');
  return result;
}

/**
 * Search competitions by name or location using cached data for better performance
 */
export async function searchCompetitions(query, limit = 20) {
  // If no query, get all upcoming competitions
  if (!query || query.trim().length < 2) {
    return await getUpcomingCompetitions(limit);
  }

  const searchTerm = query.trim().toLowerCase();

  // First, try to search using cached data for instant results
  if (isCacheValid()) {
    console.log('Using cached data for search');
    const filtered = competitionCache.data.filter(comp =>
      comp.name.toLowerCase().includes(searchTerm) ||
      comp.city.toLowerCase().includes(searchTerm) ||
      comp.country.toLowerCase().includes(searchTerm)
    );

    if (filtered.length > 0 || searchTerm.length < 3) {
      // Return cached results if found, or for short queries
      return dedupeCompetitionsById(filtered).slice(0, limit);
    }
  }

  // For longer searches with no cached results, try API search with pagination
  if (searchTerm.length >= 3) {
    const today = new Date().toISOString().split('T')[0];

    console.log(`Searching competitions with term: "${searchTerm}" from ${today} onward`);

    // Try direct API first
    try {
      const searchResults = await fetchAllCompetitionPages(today, false, searchTerm);
      if (searchResults.length > 0) {
        const formattedResults = formatOfficialCompetitions(searchResults);
        mergeCompetitionsIntoCache(formattedResults);
        return dedupeCompetitionsById(formattedResults).slice(0, limit);
      }
    } catch (error) {
      console.warn('Direct search API failed due to CORS:', error.message);
    }

    // Try CORS proxies for search
    for (const proxy of CORS_PROXIES) {
      try {
        const searchResults = await fetchAllCompetitionPages(today, proxy, searchTerm);
        if (searchResults.length > 0) {
          const formattedResults = formatOfficialCompetitions(searchResults);
          mergeCompetitionsIntoCache(formattedResults);
          return dedupeCompetitionsById(formattedResults).slice(0, limit);
        }
      } catch (proxyError) {
        console.warn(`Search CORS proxy ${proxy} failed:`, proxyError.message);
      }
    }
  }

  // Fallback to client-side filtering with all competitions
  try {
    console.log('Using client-side search fallback');
    const competitions = await getUpcomingCompetitions(500); // Get more for better search results

    const filteredCompetitions = competitions.filter(comp =>
        comp.name.toLowerCase().includes(searchTerm) ||
        comp.city.toLowerCase().includes(searchTerm) ||
        comp.country.toLowerCase().includes(searchTerm)
      );

    return dedupeCompetitionsById(filteredCompetitions).slice(0, limit);
  } catch (error) {
    console.error('Error searching competitions:', error);
    throw error;
  }
}

/**
 * Manually refresh the competition cache (useful for debugging)
 */
export async function refreshCompetitionCache() {
  console.log('Manually refreshing competition cache...');
  competitionCache.isLoading = true;
  try {
    const competitions = await fetchAndCacheCompetitions(DEFAULT_COMPETITION_LOAD_LIMIT);
    return competitions;
  } catch (error) {
    competitionCache.isLoading = false;
    throw error;
  }
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus() {
  return {
    hasData: !!competitionCache.data,
    dataCount: competitionCache.data ? competitionCache.data.length : 0,
    timestamp: competitionCache.timestamp,
    isValid: isCacheValid(),
    isLoading: competitionCache.isLoading,
    isLoadingMore: competitionCache.isLoadingMore,
    loadedPages: competitionCache.loadedPages,
    totalPages: competitionCache.totalPages,
    ageMinutes: competitionCache.timestamp ? Math.floor((Date.now() - competitionCache.timestamp) / 60000) : null
  };
}

/**
 * Get competition details by ID using official WCA API
 */
export async function getCompetitionById(competitionId) {
  const apiUrl = `${WCA_API_BASE}/competitions/${competitionId}`;

  // Try direct API first
  try {
    const response = await fetch(apiUrl);
    if (response.ok) {
      const competition = await response.json();
      if (!isUnitedStatesOfficialCompetition(competition)) {
        throw new Error('Only United States competitions are available.');
      }
      return formatSingleOfficialCompetition(competition);
    }
  } catch (error) {
    console.warn('Direct competition API failed due to CORS:', error.message);
  }

  // Try CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      let proxyUrl, response, data;

      if (proxy.includes('allorigins.win')) {
        proxyUrl = `${proxy}${encodeURIComponent(apiUrl)}`;
        response = await fetch(proxyUrl);
        if (response.ok) {
          const result = await response.json();
          data = JSON.parse(result.contents);
        }
      } else {
        proxyUrl = `${proxy}${apiUrl}`;
        response = await fetch(proxyUrl);
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data) {
        if (!isUnitedStatesOfficialCompetition(data)) {
          throw new Error('Only United States competitions are available.');
        }
        return formatSingleOfficialCompetition(data);
      }
    } catch (proxyError) {
      console.warn(`Competition CORS proxy ${proxy} failed:`, proxyError.message);
    }
  }

  throw new Error('Competition not found');
}

/**
 * Format single competition from official WCA API
 */
function formatSingleOfficialCompetition(competition) {
  return {
    id: competition.id,
    name: competition.name,
    city: competition.city,
    country: competition.country_iso2,
    latitude: competition.latitude_degrees,
    longitude: competition.longitude_degrees,
    startDate: competition.start_date,
    endDate: competition.end_date,
    venue: competition.venue || '',
    website: competition.website || competition.url || '',
    registrationOpen: competition.registration_open,
    registrationClose: competition.registration_close,
    displayName: `${competition.name} - ${competition.city}, ${competition.country_iso2}`,
    dateRange: formatDateRange(competition.start_date, competition.end_date)
  };
}

/**
 * Get competitions by country using official WCA API
 */
export async function getCompetitionsByCountry(countryCode, limit = 50) {
  try {
    const competitions = await getUpcomingCompetitions(100);

    return competitions
      .filter(comp => comp.country.toLowerCase() === countryCode.toLowerCase())
      .slice(0, limit);
  } catch (error) {
    console.error('Error fetching competitions by country:', error);
    throw error;
  }
}

/**
 * Format date range for display
 */
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };

  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString('en-US', options);
  } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${end.getDate()}, ${start.getFullYear()}`;
  } else {
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  }
}

/**
 * Check if a competition is still accepting registrations
 */
export function isRegistrationOpen(competition) {
  const now = new Date();
  const registrationClose = new Date(competition.registrationClose);
  return now < registrationClose;
}

/**
 * Get days until competition starts
 */
export function getDaysUntilCompetition(competition) {
  const now = new Date();
  const startDate = new Date(competition.startDate);
  const diffTime = startDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
