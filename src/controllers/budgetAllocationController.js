import BudgetAllocation from "../models/BudgetAllocation.js";
import User from "../models/User.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

const sanitizeScript = (value) => (value || "").toString().trim().toUpperCase();

const syncUserBudgetAmount = async (userId, budget) => {
  await User.updateOne({ _id: userId }, { $set: { budgetAmount: sanitizeNumber(budget) } });
};

export const getBudgetAllocation = async (req, res) => {
  try {
    const rawEntries = await BudgetAllocation.find({ user: req.user._id })
      .sort({ createdAt: 1 })
      .lean();
    const entries = rawEntries.map((entry) => ({
      ...entry,
      totalAmount:
        sanitizeNumber(entry?.totalAmount) ||
        sanitizeNumber(entry?.quantity) * sanitizeNumber(entry?.tradePrice)
    }));
    return res.status(200).json({
      allocation: {
        budget: sanitizeNumber(req.user?.budgetAmount),
        entries
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching budget allocation" });
  }
};

export const updateBudgetAmount = async (req, res) => {
  try {
    const budget = sanitizeNumber(req.body?.budget);
    if (budget < 5000) {
      return res.status(400).json({ message: "Budget amount must be at least 5000" });
    }
    await syncUserBudgetAmount(req.user._id, budget);
    return res.status(200).json({
      message: "Budget amount updated successfully",
      budget
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error while updating budget amount" });
  }
};

export const addBudgetAllocationEntry = async (req, res) => {
  try {
    if (sanitizeNumber(req.user?.budgetAmount) < 5000) {
      return res.status(400).json({ message: "Save budget amount (minimum 5000) before adding rows" });
    }

    const script = sanitizeScript(req.body?.script);
    if (!script) {
      return res.status(400).json({ message: "Script is required" });
    }
    const quantity = sanitizeNumber(req.body?.quantity);
    const tradePrice = sanitizeNumber(req.body?.tradePrice);

    const created = await BudgetAllocation.create({
      user: req.user._id,
      script,
      quantity,
      tradePrice,
      totalAmount: quantity * tradePrice
    });
    return res.status(201).json({ entry: created });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate key conflict while adding row. Please restart backend and try again."
      });
    }
    return res.status(500).json({ message: "Server error while adding budget entry" });
  }
};

export const updateBudgetAllocationEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const entry = await BudgetAllocation.findOne({ _id: entryId, user: req.user._id });
    if (!entry) {
      return res.status(404).json({ message: "Budget entry not found" });
    }

    if (req.body?.script !== undefined) {
      const script = sanitizeScript(req.body.script);
      if (!script) {
        return res.status(400).json({ message: "Script is required" });
      }
      entry.script = script;
    }

    if (req.body?.quantity !== undefined) {
      entry.quantity = sanitizeNumber(req.body.quantity);
    }
    if (req.body?.tradePrice !== undefined) {
      entry.tradePrice = sanitizeNumber(req.body.tradePrice);
    }
    entry.totalAmount = sanitizeNumber(entry.quantity) * sanitizeNumber(entry.tradePrice);

    await entry.save();
    return res.status(200).json({ entry });
  } catch (error) {
    return res.status(500).json({ message: "Server error while updating budget entry" });
  }
};

export const deleteBudgetAllocationEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const entry = await BudgetAllocation.findOneAndDelete({ _id: entryId, user: req.user._id });
    if (!entry) {
      return res.status(404).json({ message: "Budget entry not found" });
    }

    return res.status(200).json({ message: "Budget entry deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting budget entry" });
  }
};

export const clearBudgetAllocationEntries = async (req, res) => {
  try {
    await BudgetAllocation.deleteMany({ user: req.user._id });
    return res.status(200).json({ message: "All budget rows cleared successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while clearing budget rows" });
  }
};
