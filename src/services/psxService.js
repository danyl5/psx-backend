import axios from "axios";
import * as cheerio from "cheerio";
import { getPSXMarketState } from "../utils/marketHours.js";
import { fetchStockDetails, sarmaayaGet } from "./sarmaayaClient.js";
import { rememberSector } from "./scriptService.js";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

// How long each kind of answer is reused (ttlMs), and how much longer the
// last good one stands in while the provider is failing (staleMs).
const CACHE = {
  dividends: { ttlMs: 15 * MINUTE_MS, staleMs: 24 * HOUR_MS },
  announcements: { ttlMs: 5 * MINUTE_MS, staleMs: 6 * HOUR_MS },
  stockInsiders: { ttlMs: 15 * MINUTE_MS, staleMs: 24 * HOUR_MS },
  shariahStocks: { ttlMs: MINUTE_MS, staleMs: 6 * HOUR_MS },
  marketCalendar: { ttlMs: 10 * MINUTE_MS, staleMs: 6 * HOUR_MS },
  priceHistory: { ttlMs: 15 * MINUTE_MS, staleMs: 24 * HOUR_MS },
};

const symbolPath = (symbol) => encodeURIComponent(symbol);

export async function fetchStockPriceFromPSX(symbol) {
  try {
    const stock = await fetchStockDetails(symbol);

    if (!stock) return { symbol, price: null };

    rememberSector(stock.symbol || symbol, stock.sectorName);

    return {
      symbol: stock.symbol || symbol,
      name: stock.name || "",
      logo: stock.logo || null,
      isshariah: stock.isshariah === true,
      sectorName: stock.sectorName || "",
      price: stock.close ?? null,
      changeValue: stock.change ?? null,
      changePercentage: stock.change_percentage ?? null,
      open: null,
      high: stock.high ?? null,
      low: stock.low ?? null,
      volume: stock.volume ?? null,
      ldcp: null,
    };
  } catch (error) {
    console.error("Error fetching PSX price for", symbol, error.message);
    return { symbol, price: null };
  }
}

const MARKET_UPDATES_CACHE_TTL_MS = 60 * 1000;
// A failed read of the PSX page is tried again sooner than a good one.
const MARKET_UPDATES_RETRY_MS = 15 * 1000;
const MARKET_UPDATES_TIMEOUT_MS = 10 * 1000;
let marketUpdatesCache = null;
let marketUpdatesFreshUntil = 0;
let marketUpdatesLastGood = null;
let marketUpdatesRequest = null;

async function fetchMarketUpdatesUncachedFromPSX() {
  const url = "https://dps.psx.com.pk/";
  const response = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: MARKET_UPDATES_TIMEOUT_MS,
  });
  const $ = cheerio.load(response.data);
  // Only the KSE100 tab; the price text without its child span.
  const kse100Panel = $('.tabs__panel[data-name="KSE100"]');
  const marketIndex = kse100Panel
    .find(".marketIndices__price")
    .contents()
    .filter(function () {
      return this.type === "text";
    })
    .text()
    .trim();
  const marketValueAndPercentage = kse100Panel
    .find(".marketIndices__change")
    .text()
    .trim();
  const marketDate = kse100Panel.find(".marketIndices__date").text().trim();

  if (!marketIndex) throw new Error("KSE100 index not found on the PSX page");

  return {
    marketIndex,
    marketValueAndPercentage,
    marketDate,
    marketState: getPSXMarketState(),
  };
}

export async function fetchMarketUpdatesFromPSX() {
  if (marketUpdatesCache && Date.now() < marketUpdatesFreshUntil) {
    return marketUpdatesCache;
  }

  if (!marketUpdatesRequest) {
    marketUpdatesRequest = fetchMarketUpdatesUncachedFromPSX()
      .then((data) => {
        marketUpdatesLastGood = data;
        marketUpdatesCache = data;
        marketUpdatesFreshUntil = Date.now() + MARKET_UPDATES_CACHE_TTL_MS;
        return data;
      })
      .catch((error) => {
        console.error("Error fetching market updates:", error.message);

        // The last index that was read is still better than none; only the
        // open/closed state is worked out again, since it depends on the clock.
        marketUpdatesCache = marketUpdatesLastGood
          ? { ...marketUpdatesLastGood, marketState: getPSXMarketState() }
          : {
              marketIndex: null,
              marketValueAndPercentage: null,
              marketDate: null,
              marketState: "Closed",
            };
        marketUpdatesFreshUntil = Date.now() + MARKET_UPDATES_RETRY_MS;
        return marketUpdatesCache;
      })
      .finally(() => {
        marketUpdatesRequest = null;
      });
  }

  return marketUpdatesRequest;
}

export async function fetchStockDividendsFromPSX(symbol) {
  try {
    const data = await sarmaayaGet(
      `/stocks/dividends/${symbolPath(symbol)}`,
      CACHE.dividends,
    );

    // Only this year's payouts are returned. The cached answer is shared, so
    // it is copied rather than changed.
    const payoutHistory = data?.response?.payoutHistory;
    if (!Array.isArray(payoutHistory)) return data;

    const currentYear = String(new Date().getFullYear());
    return {
      ...data,
      response: {
        ...data.response,
        payoutHistory: payoutHistory.filter(
          (payout) => payout.year === currentYear,
        ),
      },
    };
  } catch (error) {
    console.error("Error fetching dividends for", symbol, error.message);
    throw new Error("Failed to fetch dividends");
  }
}

export async function fetchStockAnnouncementsFromPSX(
  symbol,
  { startDate, endDate } = {},
) {
  try {
    return await sarmaayaGet(`/stocks/announcements/${symbolPath(symbol)}`, {
      ...CACHE.announcements,
      params: { startDate, endDate },
    });
  } catch (error) {
    console.error("Error fetching announcements for", symbol, error.message);
    throw new Error("Failed to fetch announcements");
  }
}

const getDividendDate = (payout) =>
  payout?.announcementDate ||
  payout?.exDate ||
  payout?.xdate ||
  payout?.payoutDate ||
  "";

const getDateValue = (value) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const sortDashboardDataByUpcomingExDate = (data) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayValue = today.getTime();

  return data.sort((a, b) => {
    const getNextExDate = (item) => {
      const payoutHistory = item.dividends?.response?.payoutHistory || [];
      const upcomingDates = payoutHistory
        .map((payout) => getDateValue(getDividendDate(payout)))
        .filter((date) => date > todayValue);

      return upcomingDates.length
        ? Math.min(...upcomingDates)
        : Number.POSITIVE_INFINITY;
    };

    return getNextExDate(a) - getNextExDate(b);
  });
};

// Dividends and announcements are cached per symbol, so two users holding
// the same script share one lookup even when their portfolios differ.
export async function fetchDashboardMarketDataFromPSX(
  symbols,
  { startDate, endDate } = {},
) {
  const normalizedSymbols = [
    ...new Set(
      symbols
        .map((symbol) => (symbol || "").toString().trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort();

  const data = await Promise.all(
    normalizedSymbols.map(async (symbol) => {
      const [dividends, announcements] = await Promise.allSettled([
        fetchStockDividendsFromPSX(symbol),
        fetchStockAnnouncementsFromPSX(symbol, { startDate, endDate }),
      ]);

      return {
        symbol,
        dividends: dividends.status === "fulfilled" ? dividends.value : null,
        announcements:
          announcements.status === "fulfilled" ? announcements.value : null,
      };
    }),
  );

  return { data: sortDashboardDataByUpcomingExDate(data) };
}

export async function fetchStockInsiderTransactionsFromPSX(symbol) {
  try {
    return await sarmaayaGet(
      `/stocks/stock-insiders/${symbolPath(symbol)}`,
      CACHE.stockInsiders,
    );
  } catch (error) {
    console.error(
      "Error fetching insider transactions for",
      symbol,
      error.message,
    );
    throw new Error("Failed to fetch insider transactions");
  }
}

export async function fetchAllShariaStocks() {
  try {
    return await sarmaayaGet(
      "/indices/KMIALLSHR/companies",
      CACHE.shariahStocks,
    );
  } catch (error) {
    console.error("Error fetching all shariah stocks:", error.message);
    throw new Error("Failed to fetch shariah stocks");
  }
}

export async function fetchAllUpcomingPayouts({ from, to }) {
  try {
    return await sarmaayaGet("/announcements/payouts", {
      ...CACHE.marketCalendar,
      params: { from, to },
    });
  } catch (error) {
    console.error("Error fetching all upcoming payouts:", error.message);
    throw new Error("Failed to fetch upcoming payouts");
  }
}

export async function fetchAllUpcomingBoardMeetings({ from, to }) {
  try {
    return await sarmaayaGet("/announcements/board-meetings", {
      ...CACHE.marketCalendar,
      params: { from, to },
    });
  } catch (error) {
    console.error("Error fetching all upcoming board meetings:", error.message);
    throw new Error("Failed to fetch upcoming board meetings");
  }
}

export async function fetchAllInsiderTransactions({ from, to }) {
  try {
    return await sarmaayaGet("/announcements/insider-transactions", {
      ...CACHE.marketCalendar,
      params: { from, to },
    });
  } catch (error) {
    console.error("Error fetching all insider transactions:", error.message);
    throw new Error("Failed to fetch insider transactions");
  }
}

/**
 * `useCache: false` always asks the provider. The upper-cap scanner uses it
 * so a refresh never stores an old answer as if it were new.
 */
export async function fetchStockPriceHistoryFromPSX(
  symbol,
  days,
  { useCache = true } = {},
) {
  try {
    return await sarmaayaGet(`/stocks/price-history/${symbolPath(symbol)}`, {
      ...CACHE.priceHistory,
      params: { days },
      useCache,
    });
  } catch (error) {
    console.error("Error fetching stock price history:", {
      symbol,
      status: error.response?.status,
      code: error.code,
      message: error.message,
    });
    throw new Error("Failed to fetch stock price history");
  }
}
