import { fetchStockDividendsFromPSX } from "./psxService.js";
import { fetchStockAnnouncementsFromPSX } from "./psxService.js";

const normalizeSymbols = (symbolsInput) => [
  ...new Set(
    (Array.isArray(symbolsInput) ? symbolsInput : [symbolsInput])
      .map((symbol) => (symbol || "").toString().trim().toUpperCase())
      .filter(Boolean),
  ),
];

// Dividends and announcements are looked up independently, so one of them
// failing does not drop the notifications the other one found.
const buildNotificationsForSymbol = async (symbol, { today, startDate }) => {
  const [dividendResult, announcementResult] = await Promise.allSettled([
    fetchStockDividendsFromPSX(symbol),
    fetchStockAnnouncementsFromPSX(symbol, {
      startDate,
      endDate: today,
    }),
  ]);
  const dividendRes =
    dividendResult.status === "fulfilled" ? dividendResult.value : null;
  const announcementRes =
    announcementResult.status === "fulfilled" ? announcementResult.value : null;

  const dividends = dividendRes?.response?.payoutHistory || [];
  const dividendNotifications = dividends
    .filter((d) => d.announcementDate > today)
    .map((d) => ({
      type: "DIVIDEND",
      symbol: d.symbol || symbol,
      title: `Dividend Announced (${d.percentage}%)`,
      date: d.announcementDate,
      meta: {
        dividendPerShare: d.dividendPerShare,
        percentage: d.percentage,
      },
    }));

  const announcements = announcementRes?.response || [];
  const announcementNotifications = announcements
    .filter((a) => a.postingDate === today)
    .map((a) => ({
      type: "ANNOUNCEMENT",
      symbol: a.symbol || symbol,
      title: a.announcementTitle,
      date: a.postingDate,
      attachments: a.attachments,
    }));

  return {
    notifications: [...dividendNotifications, ...announcementNotifications],
    failed:
      dividendResult.status === "rejected" ||
      announcementResult.status === "rejected",
  };
};

export const getStockNotifications = async (symbol) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // last 10 days window for announcements
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);

    const formattedStart =
      startDate.toISOString().split("T")[0];

    const result = await buildNotificationsForSymbol(symbol, {
      today,
      startDate: formattedStart,
    });
    const notifications = result.notifications.sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    return {
      success: !result.failed,
      count: notifications.length,
      notifications,
    };
  } catch (error) {
    console.error("Notification error:", error);

    return {
      success: false,
      count: 0,
      notifications: [],
    };
  }
};

export const getMultipleStockNotifications = async (symbolsInput) => {
  try {
    const symbols = normalizeSymbols(symbolsInput);

    if (symbols.length === 0) {
      return {
        success: true,
        count: 0,
        notifications: [],
        symbols: [],
      };
    }

    const today = new Date().toISOString().split("T")[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);
    const formattedStart = startDate.toISOString().split("T")[0];

    const settled = await Promise.allSettled(
      symbols.map((symbol) =>
        buildNotificationsForSymbol(symbol, {
          today,
          startDate: formattedStart,
        }),
      ),
    );

    const notifications = settled
      .flatMap((result) =>
        result.status === "fulfilled" ? result.value.notifications : [],
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const failedSymbols = settled
      .map((result, index) =>
        result.status === "rejected" || result.value.failed
          ? symbols[index]
          : null,
      )
      .filter(Boolean);

    return {
      success: failedSymbols.length === 0,
      count: notifications.length,
      notifications,
      symbols,
      failedSymbols,
    };
  } catch (error) {
    console.error("Bulk notification error:", error);

    return {
      success: false,
      count: 0,
      notifications: [],
      symbols: [],
      failedSymbols: [],
    };
  }
};
