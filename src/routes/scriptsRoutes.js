import { Router } from "express";
import { getScripts } from "../controllers/scriptsController.js";
import protect from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", protect, getScripts);

export default router;
