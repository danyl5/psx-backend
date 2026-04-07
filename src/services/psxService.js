import axios from "axios";
import * as cheerio from "cheerio";
import compactNumberFormat from "../utils/numberFormatting.js";

export async function fetchStockPriceFromPSX(symbol) {
  try {
    const url = `https://dps.psx.com.pk/company/${symbol}`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(response.data);

    // Price selector based on PSX layout
    const priceText = $(".quote__close").first().text().trim();
    const changeValueText = $(".change__value").last().text().trim();
    const changePercentageText = $(".change__percent").text().trim();

    const price = String(Number(priceText.replace(/Rs\.?\s*/i, "")));

    const changeValue = changeValueText;
    const changePercentage = changePercentageText;

    // select REG market panel
    const regPanel = $('.tabs__panel[data-name="REG"]');

    // ---- CODE (Open, High, Low, Volume) ----
    let open = null,
      high = null,
      low = null,
      volume = null,
      ldcp = null;

    regPanel.find(".stats.stats--noborder .stats_item").each((_, el) => {
      const label = $(el).find(".stats_label").text().trim().toLowerCase();
      const valueText = $(el).find(".stats_value").text().trim();
      const value = valueText;

      if (label === "open") open = value;
      if (label === "high") high = value;
      if (label === "low") low = value;
      if (label === "volume") volume = compactNumberFormat(value);
      if (label === "ldcp") ldcp = value;
    });
    // --------------------------------------------

    // ---- Fetch LDCP ----
    const ldcpEl = regPanel
      .find(".stats .stats_item .stats_label")
      .filter((_, el) => $(el).text().trim() === "LDCP")
      .closest(".stats_item")
      .find(".stats_value");

    ldcp = ldcpEl.text().trim();

    if (Number.isNaN(price)) {
      return { symbol, price: null };
    }

    if (Number.isNaN(changeValue)) {
      return { symbol, changeValue: null };
    }

    if (Number.isNaN(changePercentage)) {
      return { symbol, changePercentage: null };
    }

    return {
      symbol,
      price,
      changeValue,
      changePercentage,
      open,
      high,
      low,
      volume,
      ldcp,
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
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(response.data);

    // ✅ Select ONLY KSE100 tab
    const kse100Panel = $('.tabs__panel[data-name="KSE100"]');

    // ✅ Get ONLY price text (exclude child span)
    const marketIndex = kse100Panel
      .find(".marketIndices__price")
      .contents()
      .filter(function () {
        return this.type === "text";
      })
      .text()
      .trim();

    // ✅ Change value + percentage
    const marketValueAndPercentage = kse100Panel
      .find(".marketIndices__change")
      .text()
      .trim();

    // Market time text
    const marketDate = kse100Panel.find(".marketIndices__date").text().trim();

    // Get timestamp attribute
    const marketTime = kse100Panel.attr("data-date");

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

export async function fetchStockInsiderTransactionsFromPSX(
  symbol
) {
  try {
    const url = `https://beta-restapi.sarmaaya.pk/api/stocks/stock-insiders/${symbol}`;
   
    const response = await axios.get(`${url}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching insider transactions for", symbol, error.message);
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
