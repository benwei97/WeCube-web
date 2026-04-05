const OPEN_METEO_GEOCODING_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const CITY_FEATURE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLC",
  "PPLG",
  "PPLL",
  "PPLS",
  "PPLX",
]);

function formatLocationResult(result) {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return parts.join(", ");
}

export async function fetchLocationSuggestions(query) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const url = new URL(OPEN_METEO_GEOCODING_URL);
  url.searchParams.set("name", trimmedQuery);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to fetch location suggestions");
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .filter((result) => CITY_FEATURE_CODES.has(result.feature_code))
    .map((result) => formatLocationResult(result))
    .filter((value, index, list) => list.indexOf(value) === index);
}
