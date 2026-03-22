import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addMyTrade,
  deleteMyTrade,
  getMyTrades,
  updateMyTrade,
} from "../controllers/myTradeController.js";

const router = Router();

router.get("/", protect, getMyTrades);
router.post("/", protect, addMyTrade);
router.put("/:id", protect, updateMyTrade);
router.delete("/:id", protect, deleteMyTrade);

export default router;

