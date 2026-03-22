import { Router } from "express";
import {
  login,
  signup,
  resetPasswordWithPin,
  verifyPinForForgotPassword,
} from "../controllers/authController.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password/verify-pin", verifyPinForForgotPassword);
router.post("/forgot-password/reset", resetPasswordWithPin);

export default router;
