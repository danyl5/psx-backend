import { fetchStockDividendsFromPSX } from "./psxService.js";
import { fetchStockAnnouncementsFromPSX } from "./psxService.js";

export const getStockNotifications = async (symbol) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // last 10 days window for announcements
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);

    const formattedStart =
      startDate.toISOString().split("T")[0];

    // parallel calls (FAST)
    const [dividendRes, announcementRes] = await Promise.all([
      fetchStockDividendsFromPSX(symbol),
      fetchStockAnnouncementsFromPSX(symbol, {
        startDate: formattedStart,
        endDate: today,
      }),
    ]);

    /* -----------------------------
       DIVIDENDS
    ------------------------------*/
    const dividends =
      dividendRes?.response?.payoutHistory || [];

    const dividendNotifications = dividends
      .filter((d) => d.announcementDate >= today) // future
      .map((d) => ({
        type: "DIVIDEND",
        symbol: d.symbol,
        title: `Dividend Announced (${d.percentage}%)`,
        date: d.announcementDate,
        meta: {
          dividendPerShare: d.dividendPerShare,
          percentage: d.percentage,
        },
      }));

    /* -----------------------------
       ANNOUNCEMENTS
    ------------------------------*/
    const announcements = announcementRes?.response || [];

    const announcementNotifications = announcements
      .filter((a) => a.postingDate === today)
      .map((a) => ({
        type: "ANNOUNCEMENT",
        symbol: a.symbol,
        title: a.announcementTitle,
        date: a.postingDate,
        attachments: a.attachments,
      }));

    /* -----------------------------
       MERGE + SORT
    ------------------------------*/
    const notifications = [
      ...dividendNotifications,
      ...announcementNotifications,
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
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