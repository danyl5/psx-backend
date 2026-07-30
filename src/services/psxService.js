import axios from "axios";
import * as cheerio from "cheerio";
import compactNumberFormat from "../utils/numberFormatting.js";

export async function fetchStockPriceFromPSX(symbol) {
  try {
    const response = await axios.get(
      `https://beta-restapi.sarmaaya.pk/api/stocks/${encodeURIComponent(symbol)}`,
    );
    const stock = response.data?.response;

    if (!stock) return { symbol, price: null };

    return {
      symbol: stock.symbol || symbol,
      name: stock.name || "",
      logo: stock.logo || null,
      isshariah: stock.isshariah === true,
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

export async function fetchMarketUpdatesFromPSX() {
  try {
    const url = "https://dps.psx.com.pk/";
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(response.data);
    const kse100Panel = $('.tabs__panel[data-name="KSE100"]');
    const marketIndex = kse100Panel
      .find(".marketIndices__price")
      .contents()
      .filter(function () { return this.type === "text"; })
      .text()
      .trim();
    const marketValueAndPercentage = kse100Panel
      .find(".marketIndices__change")
      .text()
      .trim();
    const marketDate = kse100Panel.find(".marketIndices__date").text().trim();
    const marketTime = kse100Panel.attr("data-date");

    // ✅ Select ONLY KSE100 tab
    // ✅ Get ONLY price text (exclude child span)
    // ✅ Change value + percentage
    // Derived from the REST response above.

    // Market time text
    // Determine market state
    let marketState = "Closed";

    if (marketTime) {
      const lastUpdate = new Date(marketTime);
      const now = new Date();

      const diffMinutes = (now - lastUpdate) / (1000 * 60);

      // if updated recently → market open
      if (diffMinutes < 10) {
        marketState = "Open";
      }
    }

    return {
      marketIndex,
      marketValueAndPercentage,
      marketDate,
      marketState,
    };
  } catch (error) {
    console.error("Error fetching market updates:", error.message);

    return {
      marketIndex: null,
      marketValueAndPercentage: null,
      marketDate: null,
      marketState: "Closed",
    };
  }
}

export async function fetchStockDividendsFromPSX(symbol) {
  try {
    const currentYear = String(new Date().getFullYear());
    const response = await axios.get(
      `https://beta-restapi.sarmaaya.pk/api/stocks/dividends/${symbol}`,
    );

    // Filter payoutHistory by current year
    if (response.data.response?.payoutHistory) {
      response.data.response.payoutHistory =
        response.data.response.payoutHistory.filter(
          (payout) => payout.year === currentYear,
        );
    }

    return response.data;
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
    const url = `https://beta-restapi.sarmaaya.pk/api/stocks/announcements/${symbol}`;
    const params = new URLSearchParams();

    if (startDate) params.set("startDate", String(startDate));
    if (endDate) params.set("endDate", String(endDate));

    const response = await axios.get(`${url}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching announcements for", symbol, error.message);
    throw new Error("Failed to fetch announcements");
  }
}

export async function fetchStockInsiderTransactionsFromPSX(symbol) {
  try {
    const url = `https://beta-restapi.sarmaaya.pk/api/stocks/stock-insiders/${symbol}`;

    const response = await axios.get(`${url}`);
    return response.data;
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
    const url =
      "https://beta-restapi.sarmaaya.pk/api/indices/KMIALLSHR/companies";
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching all shariah stocks:", error.message);
    throw new Error("Failed to fetch shariah stocks");
  }
}

export async function fetchAllUpcomingPayouts({ from, to }) {
  try {
    const url = "https://beta-restapi.sarmaaya.pk/api/announcements/payouts";

    const params = new URLSearchParams();

    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));

    const response = await axios.get(`${url}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching all upcoming payouts:", error.message);
    throw new Error("Failed to fetch upcoming payouts");
  }
}

export async function fetchAllUpcomingBoardMeetings({ from, to }) {
  try {
    const url = "https://beta-restapi.sarmaaya.pk/api/announcements/board-meetings";

    const params = new URLSearchParams();

    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));

    const response = await axios.get(`${url}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching all upcoming board meetings:", error.message);
    throw new Error("Failed to fetch upcoming board meetings");
  }
}


export async function fetchAllInsiderTransactions({ from, to }) {
  try {
    const url =
      "https://beta-restapi.sarmaaya.pk/api/announcements/insider-transactions";

    const params = new URLSearchParams();

    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));

    const response = await axios.get(`${url}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching all insider transactions:", error.message);
    throw new Error("Failed to fetch insider transactions");
  }
}

export async function fetchStockPriceHistoryFromPSX(symbol, days) {
  try {
    const url = `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${symbol}?days=${days}`;

    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching stock price history:", error.message);
    throw new Error("Failed to fetch stock price history");
  }
}
