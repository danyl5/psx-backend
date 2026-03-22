import { fetchStockPriceFromPSX } from "../services/psxService.js";
import { fetchMarketUpdatesFromPSX } from "../services/psxService.js";
import { fetchStockDividendsFromPSX } from "../services/psxService.js";
import { fetchStockAnnouncementsFromPSX } from "../services/psxService.js";

// Simple delay helper for retry logic
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch a single symbol with basic retry so that intermittent
// scraping/network issues don't randomly return null for one symbol.
async function fetchStockPriceFromPSXWithRetry(symbol, { retries = 2, delayMs = 700 } = {}) {
  let lastResult = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      lastResult = await fetchStockPriceFromPSX(symbol);

      // If we have a non-null price, consider it a success.
      if (lastResult && lastResult.price != null) {
        return lastResult;
      }
    } catch (err) {
      // Swallow here; we'll retry below.
      console.error(
        `Error fetching price for ${symbol} (attempt ${attempt + 1} of ${retries + 1}):`,
        err.message || err,
      );
    }

    // If not the last attempt, wait a bit before retrying.
    if (attempt < retries) {
      await wait(delayMs);
    }
  }

  // After all retries, return the last result (may still have price: null)
  return lastResult || { symbol, price: null };
}

export const getMultipleStockPricesFromPSX = async (req, res) => {
  try {
    const symbolsInput = req.body?.symbols;

    if (!Array.isArray(symbolsInput) || symbolsInput.length === 0) {
      return res
        .status(400)
        .json({ message: "symbols must be a non-empty array." });
    }

    const symbols = [...new Set(
      symbolsInput
        .map((s) => (s || "").toString().trim().toUpperCase())
        .filter((s) => s),
    )];

    if (symbols.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one valid symbol is required." });
    }

    const [results, marketUpdates] = await Promise.all([
      Promise.all(
        symbols.map((symbol) =>
          fetchStockPriceFromPSXWithRetry(symbol, { retries: 2, delayMs: 700 }),
        ),
      ),
      fetchMarketUpdatesFromPSX(),
    ]);

    return res.status(200).json({ symbols, data: results, marketUpdates });
  } catch (error) {
    console.error("Error in getMultipleStockPrices controller:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch stock prices from PSX." });
  }
};

export const getStockPrice = async (req, res) => {
  try {
    const symbol = (req.params.symbol || req.query.symbol || "")
      .toString()
      .trim()
      .toUpperCase();

    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required." });
    }

    const data = await fetchStockPriceFromPSX(symbol);

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error in getStockPrice controller:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch stock price from PSX." });
  }
};

export const getStockDividends = async (req, res) => {
  try {
    const symbol = (req.params.symbol || req.query.symbol || "")
      .toString()
      .trim()
      .toUpperCase();

    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required." });
    }

    const data = await fetchStockDividendsFromPSX(symbol);

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error in getStockDividends controller:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch dividends from PSX." });
  }
};

export const getStockAnnouncements = async (req, res) => {
  try {
    const symbol = (req.params.symbol || req.query.symbol || "")
      .toString()
      .trim()
      .toUpperCase();

    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required." });
    }

    const startDate = (req.query.startDate || "").toString().trim();
    const endDate = (req.query.endDate || "").toString().trim();

    const data = await fetchStockAnnouncementsFromPSX(symbol, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error in getStockAnnouncements controller:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch announcements from PSX." });
  }
};





