import BuyingHistory from "../models/BuyingHistory.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

export const addBuyingHistory = async (req, res) => {
  try {
    const { script = "", date, quantity = 0, price = 0 } = req.body;

    if (!script.trim()) {
      return res.status(400).json({ message: "Script is required" });
    }
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date value" });
    }

    const normalizedQuantity = sanitizeNumber(quantity);
    const normalizedPrice = sanitizeNumber(price);
    const total = normalizedQuantity * normalizedPrice;

    const buyingHistory = await BuyingHistory.create({
      user: req.user._id,
      script: script.trim().toUpperCase(),
      date: parsedDate,
      quantity: normalizedQuantity,
      price: normalizedPrice,
      total
    });

    return res.status(201).json({ buyingHistory });
  } catch (error) {
    return res.status(500).json({ message: "Server error while adding buying history record" });
  }
};

export const getBuyingHistory = async (req, res) => {
  try {
    const buyingHistory = await BuyingHistory.find({ user: req.user._id }).sort({
      script: 1,
      date: -1,
      createdAt: -1
    });
    return res.status(200).json({ buyingHistory });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching buying history records" });
  }
};

export const deleteBuyingHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const buyingHistory = await BuyingHistory.findOneAndDelete({
      _id: id,
      user: req.user._id
    });

    if (!buyingHistory) {
      return res.status(404).json({ message: "Buying history record not found" });
    }

    return res.status(200).json({ message: "Buying history record deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting buying history record" });
  }
};
