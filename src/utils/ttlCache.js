const DEFAULT_ERROR_TTL_MS = 10 * 1000;

/**
 * In-memory cache for slow lookups.
 *
 * - A value is reused until `ttlMs` has passed.
 * - Callers asking for the same key while it is loading share one load.
 * - When a load fails, the last good value is returned for up to `staleMs`
 *   past its expiry, so a short outage does not reach the caller.
 * - A key that just failed is not loaded again for `errorTtlMs`, so an
 *   outage is not made worse by every caller retrying it.
 */
export function createTtlCache({ maxEntries = 1000 } = {}) {
  const entries = new Map();
  const pending = new Map();

  const hasUsableValue = (entry, now) =>
    Boolean(entry?.hasValue) && entry.staleUntil > now;

  const store = (key, entry) => {
    // Re-inserting keeps the Map ordered by last write, oldest first.
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const get = (
    key,
    load,
    { ttlMs, staleMs = 0, errorTtlMs = DEFAULT_ERROR_TTL_MS } = {},
  ) => {
    const now = Date.now();
    const entry = entries.get(key);

    if (entry?.hasValue && entry.freshUntil > now) {
      return Promise.resolve(entry.value);
    }
    if (entry && entry.retryAt > now) {
      return hasUsableValue(entry, now)
        ? Promise.resolve(entry.value)
        : Promise.reject(entry.error);
    }

    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const request = (async () => {
      try {
        const value = await load();
        const loadedAt = Date.now();
        store(key, {
          hasValue: true,
          value,
          freshUntil: loadedAt + ttlMs,
          staleUntil: loadedAt + ttlMs + staleMs,
          retryAt: 0,
          error: null,
        });
        return value;
      } catch (error) {
        const failedAt = Date.now();
        const previous = entries.get(key);
        store(key, {
          hasValue: Boolean(previous?.hasValue),
          value: previous?.value,
          freshUntil: previous?.freshUntil || 0,
          staleUntil: previous?.staleUntil || 0,
          retryAt: failedAt + errorTtlMs,
          error,
        });
        if (hasUsableValue(previous, failedAt)) return previous.value;
        throw error;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  };

  return { get };
}
