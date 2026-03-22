import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addWatchlistRow,
  deleteWatchlistRow,
  getWatchlistRows,
  reorderWatchlistRows
} from "../controllers/watchlistController.js";

const router = Router();

router.get("/", protect, getWatchlistRows);
router.post("/", protect, addWatchlistRow);
router.put("/reorder", protect, reorderWatchlistRows);
router.delete("/:id", protect, deleteWatchlistRow);

export default router;
