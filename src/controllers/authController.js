import bcrypt from "bcryptjs";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";

const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email);
const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

export const signup = async (req, res) => {
  try {
    const { name, email, password, pin, filer, zakatDeductible } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !pin ||
      typeof filer !== "boolean" ||
      typeof zakatDeductible !== "boolean"
    ) {
      return res
        .status(400)
        .json({
          message:
            "Name, email, password, pin, filer, and zakat deductible are required",
        });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, lowercase, and number"
      });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ message: "Pin must be exactly 4 digits" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const salt = await bcrypt.genSalt(10);
    // Hash password before writing to MongoDB.
    const hashedPassword = await bcrypt.hash(password, salt);
    const hashedPin = await bcrypt.hash(pinStr, salt);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      pin: hashedPin,
      filer,
      zakatDeductible
    });

    return res.status(201).json({
      token: generateToken(user._id),
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
    return res.status(500).json({ message: "Server error during signup." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.status(200).json({
      token: generateToken(user._id),
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
    return res.status(500).json({ message: "Server error during login." });
  }
};

export const verifyPinForForgotPassword = async (req, res) => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({ message: "Email and pin are required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ message: "Pin must be exactly 4 digits" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.pin) {
      return res.status(401).json({ message: "Invalid email or pin." });
    }

    const isPinMatch = await bcrypt.compare(pinStr, user.pin);
    if (!isPinMatch) {
      return res.status(401).json({ message: "Invalid email or pin." });
    }

    return res.status(200).json({ message: "Pin verified successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error while verifying pin." });
  }
};

export const resetPasswordWithPin = async (req, res) => {
  try {
    const { email, pin, newPassword, confirmNewPassword } = req.body;

    if (
      !email ||
      !pin ||
      !newPassword ||
      !confirmNewPassword
    ) {
      return res.status(400).json({ message: "All password fields are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ message: "Pin must be exactly 4 digits" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message:
          "New password must be at least 8 characters and include uppercase, lowercase, and number"
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.pin) {
      return res.status(401).json({ message: "Invalid email or pin." });
    }

    const isPinMatch = await bcrypt.compare(pinStr, user.pin);
    if (!isPinMatch) {
      return res.status(401).json({ message: "Invalid email or pin." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Server error while resetting password." });
  }
};
