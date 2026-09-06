import axios from "axios";

const SCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 1000;
let scriptsCache = null;
let scriptsCachedAt = 0;
let scriptsRequest = null;
let scriptsRateLimitedUntil = 0;

class ScriptsUpstreamError extends Error {
  constructor(message, { status, retryAfter } = {}) {
    super(message);
    this.name = "ScriptsUpstreamError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const getRetryAfterSeconds = (error) => {
  const headerValue = error.response?.headers?.["retry-after"];
  const bodyValue = error.response?.data?.retry_after;
  const retryAfter = Number(headerValue ?? bodyValue);

  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.ceil(retryAfter)
    : Math.ceil(DEFAULT_RATE_LIMIT_COOLDOWN_MS / 1000);
};

export async function fetchScripts() {
  const now = Date.now();
  if (scriptsCache && now - scriptsCachedAt < SCRIPT_CACHE_TTL_MS) {
    return scriptsCache;
  }

  if (now < scriptsRateLimitedUntil) {
    const retryAfter = Math.ceil((scriptsRateLimitedUntil - now) / 1000);
    throw new ScriptsUpstreamError("Scripts provider is rate-limited", {
      status: 429,
      retryAfter,
    });
  }

  if (scriptsRequest) {
    return scriptsRequest;
  }

  scriptsRequest = axios
    .get("https://beta-restapi.sarmaaya.pk/api/stocks/listing?limit=1000", {
      timeout: 15000,
    })
    .then((response) => {
      const scripts = Array.isArray(response.data?.response?.data)
        ? response.data.response.data
        : [];
      scriptsCache = scripts;
      scriptsCachedAt = Date.now();
      return scripts;
    })
    .catch((error) => {
      const status = error.response?.status;
      const isRateLimited = status === 429 || error.response?.data?.error_code === 1015;
      const retryAfter = isRateLimited ? getRetryAfterSeconds(error) : undefined;

      if (isRateLimited) {
        scriptsRateLimitedUntil = Date.now() + retryAfter * 1000;
        if (scriptsCache) {
          console.warn(
            `Scripts provider rate-limited; serving cache from ${new Date(scriptsCachedAt).toISOString()}`,
          );
          return scriptsCache;
        }
      }

      console.error(
        "Error fetching scripts:",
        error.response?.data || error.message,
      );
      throw new ScriptsUpstreamError("Failed to fetch scripts", {
        status,
        retryAfter,
      });
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
