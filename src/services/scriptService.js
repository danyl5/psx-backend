import axios from "axios";

const SCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;
let scriptsCache = null;
let scriptsCachedAt = 0;
let scriptsRequest = null;

export async function fetchScripts() {
  const now = Date.now();
  if (scriptsCache && now - scriptsCachedAt < SCRIPT_CACHE_TTL_MS) {
    return scriptsCache;
  }

  if (scriptsRequest) {
    return scriptsRequest;
  }

  scriptsRequest = axios
    .get("https://beta-restapi.sarmaaya.pk/api/stocks/listing?limit=1000")
    .then((response) => {
      const scripts = Array.isArray(response.data?.response?.data)
        ? response.data.response.data
        : [];
      scriptsCache = scripts;
      scriptsCachedAt = Date.now();
      return scripts;
    })
    .catch((error) => {
      console.error(
        "Error fetching scripts:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to fetch scripts");
    })
    .finally(() => {
      scriptsRequest = null;
    });

  return scriptsRequest;
}

export async function findScriptBySymbol(symbol) {
  const normalizedSymbol = (symbol || "").toString().trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const scripts = await fetchScripts();
  return (
    scripts.find(
      (script) =>
        (script.symbol || "").toString().trim().toUpperCase() ===
        normalizedSymbol,
    ) || null
  );
}

export async function findScriptsBySymbols(symbols) {
  const normalizedSymbols = new Set(
    (symbols || [])
      .map((symbol) => (symbol || "").toString().trim().toUpperCase())
      .filter(Boolean),
  );
  if (!normalizedSymbols.size) return [];

  const scripts = await fetchScripts();
  return scripts.filter((script) =>
    normalizedSymbols.has(
      (script.symbol || "").toString().trim().toUpperCase(),
    ),
  );
}
