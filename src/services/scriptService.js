import { fetchStockDetails, sarmaayaGet } from "./sarmaayaClient.js";

const SCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;
// The listing barely changes, so the last good copy stands in for a day
// when the provider cannot be reached.
const SCRIPT_CACHE_STALE_MS = 24 * 60 * 60 * 1000;

export async function fetchScripts() {
  try {
    const data = await sarmaayaGet("/stocks/listing", {
      params: { limit: 1000 },
      ttlMs: SCRIPT_CACHE_TTL_MS,
      staleMs: SCRIPT_CACHE_STALE_MS,
    });
    return Array.isArray(data?.response?.data) ? data.response.data : [];
  } catch (error) {
    console.error(
      "Error fetching scripts:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to fetch scripts");
  }
}

/*
 * Sectors.
 *
 * The listing above no longer carries a sector for any script, but the
 * single-stock lookup still does. A script's sector is fetched from there
 * the first time it is needed and remembered, since sectors rarely change.
 */
const SECTOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// A script the provider had no sector for is asked about again sooner.
const SECTOR_MISS_CACHE_TTL_MS = 10 * 60 * 1000;
const sectorCache = new Map();

/** Remembers a sector that another lookup of the stock already returned. */
export function rememberSector(symbol, sectorName) {
  const normalizedSymbol = (symbol || "").toString().trim().toUpperCase();
  const normalizedSector = (sectorName || "").toString().trim();
  if (!normalizedSymbol) return;

  sectorCache.set(normalizedSymbol, {
    sectorName: normalizedSector,
    expiresAt:
      Date.now() +
      (normalizedSector ? SECTOR_CACHE_TTL_MS : SECTOR_MISS_CACHE_TTL_MS),
  });
}

async function fetchSectorName(symbol) {
  const cached = sectorCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sectorName;
  }

  try {
    const stock = await fetchStockDetails(symbol);
    const sectorName = (stock?.sectorName || "").toString().trim();
    rememberSector(symbol, sectorName);
    return sectorName;
  } catch (error) {
    // Not remembered, so a later request tries again.
    console.error("Error fetching sector for", symbol, error.message);
    return "";
  }
}

/** Returns the script with its sector filled in when the listing has none. */
async function withSector(script) {
  if (!script || script.sectorName) return script;

  const symbol = (script.symbol || "").toString().trim().toUpperCase();
  const sectorName = symbol ? await fetchSectorName(symbol) : "";
  return sectorName ? { ...script, sectorName } : script;
}

export async function findScriptBySymbol(symbol) {
  const normalizedSymbol = (symbol || "").toString().trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const scripts = await fetchScripts();
  const script =
    scripts.find(
      (item) =>
        (item.symbol || "").toString().trim().toUpperCase() ===
        normalizedSymbol,
    ) || null;

  return withSector(script);
}

export async function findScriptsBySymbols(symbols) {
  const normalizedSymbols = new Set(
    (symbols || [])
      .map((symbol) => (symbol || "").toString().trim().toUpperCase())
      .filter(Boolean),
  );
  if (!normalizedSymbols.size) return [];

  const scripts = await fetchScripts();
  const matched = scripts.filter((script) =>
    normalizedSymbols.has(
      (script.symbol || "").toString().trim().toUpperCase(),
    ),
  );

  // The Sarmaaya client already limits how many lookups run at once.
  return Promise.all(matched.map(withSector));
}
