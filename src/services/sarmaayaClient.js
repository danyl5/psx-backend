import https from "node:https";
import axios from "axios";
import { getPSXMarketState } from "../utils/marketHours.js";
import { createTtlCache } from "../utils/ttlCache.js";

/*
 * Single door to the Sarmaaya API.
 *
 * The provider allows 20 requests a second for the whole server (it says so
 * in its `x-ratelimit-*` response headers) and refuses the rest with a 429.
 * Every call therefore goes through one queue that stays under that limit,
 * and through one cache so the same answer is not asked for twice.
 *
 * The queue is kept well below 20: requests started within one second can
 * still land in the same second on the provider's side as earlier ones.
 */
const BASE_URL = "https://beta-restapi.sarmaaya.pk/api";
const REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_CONCURRENT = 6;
const MAX_PER_SECOND = 12;
// A request that cannot start within this time gives up instead of piling up.
const MAX_QUEUE_WAIT_MS = 15 * 1000;
// The provider's limit resets every second, so a short pause is enough.
const RATE_LIMIT_PAUSE_MIN_MS = 1000;
const RATE_LIMIT_PAUSE_MAX_MS = 10 * 1000;
const RATE_LIMIT_PAUSE_DEFAULT_MS = 2 * 1000;
const RETRY_DELAY_MS = 300;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: MAX_CONCURRENT }),
});

const cache = createTtlCache({ maxEntries: 2000 });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---- Queue: at most MAX_CONCURRENT at once and MAX_PER_SECOND started ---- */

let activeCount = 0;
let pausedUntil = 0;
let drainTimer = null;
const waiting = [];
const recentStarts = [];

const getStartDelay = () => {
  const now = Date.now();
  if (now < pausedUntil) return pausedUntil - now;

  while (recentStarts.length && now - recentStarts[0] >= 1000) {
    recentStarts.shift();
  }
  return recentStarts.length >= MAX_PER_SECOND
    ? 1000 - (now - recentStarts[0])
    : 0;
};

const drainQueue = () => {
  if (drainTimer) return;

  while (waiting.length && activeCount < MAX_CONCURRENT) {
    const delay = getStartDelay();
    if (delay > 0) {
      drainTimer = setTimeout(() => {
        drainTimer = null;
        drainQueue();
      }, delay);
      return;
    }

    const waiter = waiting.shift();
    clearTimeout(waiter.timeout);
    activeCount += 1;
    recentStarts.push(Date.now());
    waiter.resolve();
  }
};

const acquireSlot = () =>
  new Promise((resolve, reject) => {
    const waiter = { resolve, timeout: null };
    waiter.timeout = setTimeout(() => {
      const index = waiting.indexOf(waiter);
      if (index !== -1) waiting.splice(index, 1);
      reject(new Error("Sarmaaya request queue is full"));
    }, MAX_QUEUE_WAIT_MS);
    waiting.push(waiter);
    drainQueue();
  });

const releaseSlot = () => {
  activeCount -= 1;
  drainQueue();
};

const pauseFor = (ms) => {
  pausedUntil = Math.max(pausedUntil, Date.now() + ms);
};

const getRateLimitHeader = (headers, name) => {
  const key = Object.keys(headers || {}).find((header) =>
    header.toLowerCase().startsWith(`x-ratelimit-${name}`),
  );
  const value = key ? Number(headers[key]) : NaN;
  return Number.isFinite(value) ? value : null;
};

const clampPause = (ms) =>
  Math.min(Math.max(ms, RATE_LIMIT_PAUSE_MIN_MS), RATE_LIMIT_PAUSE_MAX_MS);

// Slows down before the provider has to refuse anything.
const noteRateLimitHeaders = (headers) => {
  const remaining = getRateLimitHeader(headers, "remaining");
  if (remaining === null || remaining > 2) return;

  const resetSeconds = getRateLimitHeader(headers, "reset");
  pauseFor(Math.min((resetSeconds || 1) * 1000, RATE_LIMIT_PAUSE_MIN_MS));
};

const noteRateLimitRefusal = (headers) => {
  const seconds =
    Number(headers?.["retry-after"]) || getRateLimitHeader(headers, "reset");
  const pauseMs = clampPause(
    seconds ? seconds * 1000 : RATE_LIMIT_PAUSE_DEFAULT_MS,
  );
  console.warn(`Sarmaaya rate limit reached; pausing requests for ${pauseMs}ms`);
  pauseFor(pauseMs);
};

const isRetryable = (error) => {
  const status = error.response?.status;
  if (status) return status === 429 || RETRYABLE_STATUSES.has(status);
  return RETRYABLE_CODES.has(error.code);
};

const sendOnce = async (path, params) => {
  await acquireSlot();
  try {
    const response = await client.get(path, { params });
    noteRateLimitHeaders(response.headers);
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      noteRateLimitRefusal(error.response.headers);
    }
    throw error;
  } finally {
    releaseSlot();
  }
};

// One more try for failures that usually pass the second time. A refusal
// for asking too often waits in the queue until the pause is over.
const send = async (path, params) => {
  try {
    return await sendOnce(path, params);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    if (error.response?.status !== 429) await wait(RETRY_DELAY_MS);
    return sendOnce(path, params);
  }
};

const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );

const buildCacheKey = (path, params) =>
  `${path}?${new URLSearchParams(
    Object.entries(params)
      .map(([key, value]) => [key, String(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString()}`;

/**
 * GET a Sarmaaya path and return the response body.
 *
 * @param {string} path  Path under /api, e.g. "/stocks/HBL".
 * @param {object} options
 * @param {object} [options.params]    Query parameters; empty ones are dropped.
 * @param {number} options.ttlMs       How long the answer is reused.
 * @param {number} [options.staleMs]   How much longer the last good answer
 *                                     stands in when the provider is failing.
 * @param {boolean} [options.useCache] False to always ask the provider.
 * @param {*} [options.notFoundValue]  Returned (and remembered) for a 404
 *                                     instead of throwing.
 */
export function sarmaayaGet(
  path,
  { params, ttlMs, staleMs = 0, useCache = true, notFoundValue } = {},
) {
  const query = cleanParams(params);
  const load = async () => {
    try {
      return await send(path, query);
    } catch (error) {
      if (notFoundValue !== undefined && error.response?.status === 404) {
        return notFoundValue;
      }
      throw error;
    }
  };

  if (!useCache) return load();
  return cache.get(buildCacheKey(path, query), load, { ttlMs, staleMs });
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Live details of one stock (price, day range, volume, sector), or null when
 * the provider does not know the symbol. Prices move only while the market
 * is open, so they are asked for far less often once it has closed.
 */
export async function fetchStockDetails(symbol) {
  const isOpen = getPSXMarketState() === "Open";
  const data = await sarmaayaGet(`/stocks/${encodeURIComponent(symbol)}`, {
    ttlMs: isOpen ? 20 * SECOND_MS : 2 * MINUTE_MS,
    staleMs: isOpen ? 10 * MINUTE_MS : 12 * HOUR_MS,
    notFoundValue: null,
  });
  return data?.response || null;
}
