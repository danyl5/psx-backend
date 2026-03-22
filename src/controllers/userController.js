import bcrypt from "bcryptjs";
import User from "../models/User.js";

const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

export const getProfile = async (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      budgetAmount: req.user.budgetAmount ?? 0,
      filer: req.user.filer ?? true,
      zakatDeductible: req.user.zakatDeductible ?? true
    }
  });
};

export const updateProfile = async (req, res) => {
  try {
    const { name, filer, zakatDeductible, pin } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (typeof filer !== "boolean" || typeof zakatDeductible !== "boolean") {
      return res.status(400).json({
        message: "Filer and zakat deductible must be boolean true/false"
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = name.trim();
    user.filer = filer;
    user.zakatDeductible = zakatDeductible;

    if (pin) {
      const pinStr = String(pin).trim();
      if (!/^\d{4}$/.test(pinStr)) {
        return res.status(400).json({ message: "Pin must be exactly 4 digits" });
      }
      const salt = await bcrypt.genSalt(10);
      user.pin = await bcrypt.hash(pinStr, salt);
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        budgetAmount: user.budgetAmount ?? 0,
        filer: user.filer ?? true,
        zakatDeductible: user.zakatDeductible ?? true
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error while updating profile" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: "All password fields are required" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: "New password must be at least 8 characters and include uppercase, lowercase, and number"
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while changing password" });
  }
};
