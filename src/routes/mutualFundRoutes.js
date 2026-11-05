import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  archiveMutualFund,
  createMutualFund,
  createMutualFundTransaction,
  deleteMutualFundTransaction,
  getMutualFundDashboard,
  getMutualFundDetails,
  getMutualFundTransaction,
  getMutualFundTransactions,
  getMutualFunds,
  restoreMutualFund,
  updateMutualFund,
  updateMutualFundTransaction,
} from "../controllers/mutualFundController.js";

const router = Router();

router.use(protect);

router.get("/dashboard", getMutualFundDashboard);
router.get("/transactions", getMutualFundTransactions);
router.post("/transactions", createMutualFundTransaction);
router.get("/transactions/:transactionId", getMutualFundTransaction);
router.put("/transactions/:transactionId", updateMutualFundTransaction);
router.delete("/transactions/:transactionId", deleteMutualFundTransaction);

router.get("/", getMutualFunds);
router.post("/", createMutualFund);
router.get("/:fundId", getMutualFundDetails);
router.put("/:fundId", updateMutualFund);
router.patch("/:fundId/restore", restoreMutualFund);
router.delete("/:fundId", archiveMutualFund);

export default router;
