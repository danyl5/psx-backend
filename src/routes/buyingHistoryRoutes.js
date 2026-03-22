import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addBuyingHistory,
  deleteBuyingHistory,
  getBuyingHistory
} from "../controllers/buyingHistoryController.js";

const router = Router();

router.get("/", protect, getBuyingHistory);
router.post("/", protect, addBuyingHistory);
router.delete("/:id", protect, deleteBuyingHistory);

export default router;
