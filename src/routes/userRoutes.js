import { Router } from "express";
import protect from "../middleware/authMiddleware.js";
import {
  changePassword,
  getProfile,
  updateProfile
} from "../controllers/userController.js";

const router = Router();

router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);

export default router;
