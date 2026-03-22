import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import { addDividend, deleteDividend, getDividends } from "../controllers/dividendController.js";

const router = Router();

router.get("/", protect, getDividends);
router.post("/", protect, addDividend);
router.delete("/:id", protect, deleteDividend);

export default router;
