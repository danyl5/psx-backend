import PriceHistory from "../models/PriceHistory.js";
import UpperCapSnapshot from "../models/UpperCapSnapshot.js";
import {
  fetchAllShariaStocks,
  fetchStockPriceHistoryFromPSX,
} from "./psxService.js";

const UPPER_CAP_THRESHOLD = 9.99;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 30;
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const PRICE_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_CONCURRENCY = 2;

let refreshPromise = null;

const getArrayResponse = (response) => {
  const data =
    response?.response?.data ||
    response?.response ||
    response?.data ||
    response;
  return Array.isArray(data) ? data : [];
};

const getSymbols = (response) =>
  getArrayResponse(response)
    .map((stock) => (stock?.symbol || "").toString().trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index);

const normalizeHistory = (response) =>
  getArrayResponse(response)
    .map((item) => ({
      date: new Date(item?.date),
      price: Number(item?.price),
    }))
    .filter((item) => !Number.isNaN(item.date.getTime()) && item.price > 0)
    .sort((a, b) => a.date - b.date)
    .filter(
      (item, index, history) =>
        index === 0 ||
        item.date.getTime() !== history[index - 1].date.getTime(),
    );

const calculateWindow = (symbol, history, days) => {
  const rows = history
    .slice(-(days + 1))
    .map((item, index, selectedHistory) => {
      const previousPrice = index > 0 ? selectedHistory[index - 1].price : null;
      const changePercent = previousPrice
        ? ((item.price - previousPrice) / previousPrice) * 100
        : null;

      return {
        date: item.date,
        price: item.price,
        previousPrice,
        changePercent,
        isUpperCap:
          changePercent !== null && changePercent >= UPPER_CAP_THRESHOLD,
      };
    });

  let maximumConsecutiveDays = 0;
  let consecutiveDays = 0;
  rows.forEach((row) => {
    consecutiveDays = row.isUpperCap ? consecutiveDays + 1 : 0;
    maximumConsecutiveDays = Math.max(maximumConsecutiveDays, consecutiveDays);
  });

  const currentRow = rows[rows.length - 1];
  const firstPrice = rows[0]?.price || 0;

  return {
    symbol,
    rows,
    upperCapDays: rows.filter((row) => row.isUpperCap).length,
    notUpperCapDays: rows.filter(
      (row) => row.changePercent !== null && !row.isUpperCap,
    ).length,
    currentChangePercent: currentRow?.changePercent ?? null,
    currentDayHit: Boolean(currentRow?.isUpperCap),
    maximumConsecutiveDays,
    firstPrice,
    currentPrice: currentRow?.price || 0,
    overallMovePercent: firstPrice
      ? ((currentRow.price - firstPrice) / firstPrice) * 100
      : 0,
    days,
  };
};

const refreshHistory = async (symbol, existingHistory) => {
  try {
    const response = await fetchStockPriceHistoryFromPSX(symbol, MAX_DAYS + 1);
    const prices = normalizeHistory(response);

    if (!prices.length) return existingHistory;

    await PriceHistory.findOneAndUpdate(
      { symbol },
      { symbol, prices, fetchedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return prices;
  } catch (error) {
    console.error(
      `Unable to refresh price history for ${symbol}:`,
      error.message,
    );
    return existingHistory;
  }
};

const refreshWithLimit = async (symbols, historyBySymbol) => {
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < symbols.length) {
      const symbol = symbols[nextIndex];
      nextIndex += 1;
      historyBySymbol.set(
        symbol,
        await refreshHistory(symbol, historyBySymbol.get(symbol) || []),
      );
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(REFRESH_CONCURRENCY, symbols.length) },
      worker,
    ),
  );
};

export const getUpperCapScannerResults = async (
  requestedDays = DEFAULT_DAYS,
) => {
  const days = Math.min(
    Math.max(Number(requestedDays) || DEFAULT_DAYS, 5),
    MAX_DAYS,
  );
  const snapshot = await UpperCapSnapshot.findOne({ key: "latest" }).lean();

  return {
    threshold: snapshot?.threshold || UPPER_CAP_THRESHOLD,
    days,
    calculatedAt: snapshot?.calculatedAt || null,
    results: snapshot?.results || [],
    status: refreshPromise ? "refreshing" : "ready",
  };
};

const buildSnapshot = async () => {
  const shariahStocks = await fetchAllShariaStocks();
  const symbols = getSymbols(shariahStocks);
  const cachedRows = await PriceHistory.find({
    symbol: { $in: symbols },
  }).lean();
  const historyBySymbol = new Map(
    cachedRows.map((row) => [
      row.symbol,
      row.prices
        .map((item) => ({
          date: new Date(item.date),
          price: Number(item.price),
        }))
        .sort((a, b) => a.date - b.date),
    ]),
  );
  const missingSymbols = symbols.filter(
    (symbol) => !historyBySymbol.has(symbol),
  );
  const staleSymbols = cachedRows
    .filter(
      (row) =>
        Date.now() - new Date(row.fetchedAt).getTime() >= PRICE_HISTORY_TTL_MS,
    )
    .map((row) => row.symbol);

  await refreshWithLimit(
    [...new Set([...missingSymbols, ...staleSymbols])],
    historyBySymbol,
  );

  const results = symbols.map((symbol) => {
    const history = historyBySymbol.get(symbol) || [];
    const windows = {};
    for (let windowDays = 5; windowDays <= MAX_DAYS; windowDays += 5) {
      windows[windowDays] = calculateWindow(symbol, history, windowDays);
    }
    return { symbol, windows };
  });
  await UpperCapSnapshot.findOneAndUpdate(
    { key: "latest" },
    {
      key: "latest",
      threshold: UPPER_CAP_THRESHOLD,
      calculatedAt: new Date(),
      results,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const startUpperCapScannerRefresh = () => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = buildSnapshot()
    .catch((error) => {
      console.error("Upper-cap scanner refresh failed:", error);
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

export const getUpperCapScannerResponse = async (
  requestedDays = DEFAULT_DAYS,
) => {
  const days = Math.min(
    Math.max(Number(requestedDays) || DEFAULT_DAYS, 5),
    MAX_DAYS,
  );
  const snapshot = await UpperCapSnapshot.findOne({ key: "latest" }).lean();
  const isStale =
    !snapshot ||
    Date.now() - new Date(snapshot.calculatedAt).getTime() >= SNAPSHOT_TTL_MS;

  if (isStale) startUpperCapScannerRefresh();

  const response = await getUpperCapScannerResults(days);
  return {
    threshold: UPPER_CAP_THRESHOLD,
    days,
    calculatedAt: response.calculatedAt,
    results: response.results,
    status: response.calculatedAt ? response.status : "refreshing",
  };
};
