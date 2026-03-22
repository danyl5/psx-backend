import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  addBudgetAllocationEntry,
  clearBudgetAllocationEntries,
  deleteBudgetAllocationEntry,
  getBudgetAllocation,
  updateBudgetAllocationEntry,
  updateBudgetAmount
} from "../controllers/budgetAllocationController.js";

const router = Router();

router.get("/", protect, getBudgetAllocation);
router.put("/budget", protect, updateBudgetAmount);
router.post("/entries", protect, addBudgetAllocationEntry);
router.delete("/entries", protect, clearBudgetAllocationEntries);
router.put("/entries/:entryId", protect, updateBudgetAllocationEntry);
router.delete("/entries/:entryId", protect, deleteBudgetAllocationEntry);

export default router;
