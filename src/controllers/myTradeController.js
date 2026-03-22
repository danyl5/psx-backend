import MyTrade from "../models/MyTrade.js";

const sanitizeNumber = (value) => {
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    return 0;
  }
  return num;
};

// 0: active, 1: profit, 2: loss, 3: no P/L
const getStatusOrder = (row) => {
  const quantity = Number(row.quantity) || 0;
  const buyPrice = Number(row.buyPrice) || 0;
  const sellPrice = Number(row.sellPrice) || 0;

  // Active (no sell yet)
  if (!sellPrice) return 0;

  // No P/L (closed at same non-zero price)
  if (sellPrice === buyPrice && sellPrice !== 0) return 3;

  const profit = quantity * (sellPrice - buyPrice);
  if (profit > 0) return 1;
  if (profit < 0) return 2;

  return 3;
};

export const getMyTrades = async (req, res) => {
  try {
    const rows = await MyTrade.find({ user: req.user._id })
      .sort({ createdAt: 1 })
      .lean();

    // Stable sort: keeps createdAt order within same status group
    rows.sort((a, b) => getStatusOrder(a) - getStatusOrder(b));

    return res.status(200).json({ rows });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while fetching trades" });
  }
};

export const addMyTrade = async (req, res) => {
  try {
    const {
      script = "",
      quantity = 0,
      buyPrice = 0,
      sellPrice = 0,
      dividend = 0,
    } = req.body;

    if (!script.toString().trim()) {
      return res.status(400).json({ message: "Script is required" });
    }

    const normalizedScript = script.toString().trim().toUpperCase();

    const row = await MyTrade.create({
      user: req.user._id,
      script: normalizedScript,
      quantity: sanitizeNumber(quantity),
      buyPrice: sanitizeNumber(buyPrice),
      sellPrice: sanitizeNumber(sellPrice),
      dividend: sanitizeNumber(dividend),
    });

    return res.status(201).json({ row });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while adding trade" });
  }
};

export const updateMyTrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { script, quantity, buyPrice, sellPrice, dividend } = req.body;

    const row = await MyTrade.findOne({ _id: id, user: req.user._id });
    if (!row) {
      return res.status(404).json({ message: "Trade not found" });
    }

    if (typeof script === "string") {
      if (!script.trim()) {
        return res.status(400).json({ message: "Script is required" });
      }
      row.script = script.trim().toUpperCase();
    }

    if (quantity !== undefined) {
      row.quantity = sanitizeNumber(quantity);
    }

    if (buyPrice !== undefined) {
      row.buyPrice = sanitizeNumber(buyPrice);
    }

    if (sellPrice !== undefined) {
      row.sellPrice = sanitizeNumber(sellPrice);
    }

    if (dividend !== undefined) {
      row.dividend = sanitizeNumber(dividend);
    }

    await row.save();
    return res.status(200).json({ row });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while updating trade" });
  }
};

export const deleteMyTrade = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await MyTrade.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!row) {
      return res.status(404).json({ message: "Trade not found" });
    }

    return res.status(200).json({ message: "Trade deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while deleting trade" });
  }
};

