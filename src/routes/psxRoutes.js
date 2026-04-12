import { Router } from "express";
import {
  getStockPrice,
  getMultipleStockPricesFromPSX,
  getStockDividends,
  getStockAnnouncements,
  getAllShariahStocks,
  getNotifications,
  getStockInsiderTransactions,
  getAllUpcomingPayouts,
  getAllInsiderTransactions,
} from "../controllers/psxController.js";

const router = Router();

// Single symbol: GET /api/psx/price/:symbol
router.get("/price/:symbol", getStockPrice);

// Multiple symbols: POST /api/psx/prices  { "symbols": ["SYS", "HBL", ...] }
router.post("/prices", getMultipleStockPricesFromPSX);

// GET /api/psx/dividends/:symbol
router.get("/dividends/:symbol", getStockDividends);

// GET /api/psx/announcements/:symbol?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/announcements/:symbol", getStockAnnouncements);

// GET /api/psx/payouts?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/payouts", getAllUpcomingPayouts);

// GET /api/psx/insider-transactions?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/insider-transactions", getAllInsiderTransactions);

router.get("/insider-transactions/:symbol", getStockInsiderTransactions);

router.get("/shariah-stocks", getAllShariahStocks);

router.get("/notifications/:symbol", getNotifications);



export default router;
