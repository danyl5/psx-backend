import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addPortfolioRow,
  createPortfolioTab,
  deletePortfolioRow,
  deletePortfolioTab,
  getPortfolioRows,
  getPortfolioTabs,
  reorderPortfolioRows,
  updatePortfolioRow,
  updatePortfolioTab
} from "../controllers/portfolioController.js";

const router = Router();

router.get("/tabs", protect, getPortfolioTabs);
router.post("/tabs", protect, createPortfolioTab);
router.put("/tabs/:portfolionumber", protect, updatePortfolioTab);
router.delete("/tabs/:portfolionumber", protect, deletePortfolioTab);

router.get("/", protect, getPortfolioRows);
router.post("/", protect, addPortfolioRow);
router.put("/reorder", protect, reorderPortfolioRows);
router.put("/:id", protect, updatePortfolioRow);
router.delete("/:id", protect, deletePortfolioRow);

export default router;
