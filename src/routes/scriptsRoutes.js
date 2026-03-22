import { Router } from "express";
import { getScripts, importScriptsFromFile } from "../controllers/scriptsController.js";
import protect from "../middleware/authMiddleware.js";

const router = Router();

router.post("/import", protect, importScriptsFromFile);
router.get("/", protect, getScripts);

export default router;
