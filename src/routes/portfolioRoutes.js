import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addPortfolioRow,
  deletePortfolioRow,
  getPortfolioRows,
  reorderPortfolioRows,
  updatePortfolioRow
} from "../controllers/portfolioController.js";

const router = Router();

router.get("/", protect, getPortfolioRows);
router.post("/", protect, addPortfolioRow);
router.put("/reorder", protect, reorderPortfolioRows);
router.put("/:id", protect, updatePortfolioRow);
router.delete("/:id", protect, deletePortfolioRow);

export default router;
