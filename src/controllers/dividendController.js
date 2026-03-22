import Dividend from "../models/Dividend.js";
import Portfolio from "../models/Portfolio.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

const syncPortfolioDividendTotals = async (userId, script) => {
  const normalizedScript = (script || "").toString().trim().toUpperCase();
  if (!normalizedScript) {
    return;
  }

  const [totals] = await Dividend.aggregate([
    {
      $match: {
        user: userId,
        script: normalizedScript
      }
    },
    {
      $group: {
        _id: null,
        totalDividend: { $sum: "$totalDividend" },
        totalAfterTax: { $sum: "$totalAfterTax" }
      }
    }
  ]);

  await Portfolio.updateMany(
    { user: userId, script: normalizedScript },
    {
      $set: {
        dividendTotal: totals?.totalDividend || 0,
        dividendAfterTax: totals?.totalAfterTax || 0
      }
    }
  );
};

export const addDividend = async (req, res) => {
  try {
    const { script = "", date, shares = 0, dividendPerShare = 0 } = req.body;

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

    const normalizedShares = sanitizeNumber(shares);
    const normalizedDividendPerShare = sanitizeNumber(dividendPerShare);
    const totalDividend = normalizedShares * normalizedDividendPerShare;
    const taxPercent = req.user?.filer === false ? 30 : 15;
    const totalAfterTax = totalDividend * (1 - taxPercent / 100);

    const dividend = await Dividend.create({
      user: req.user._id,
      script: script.trim().toUpperCase(),
      date: parsedDate,
      shares: normalizedShares,
      dividendPerShare: normalizedDividendPerShare,
      totalDividend,
      taxPercent,
      totalAfterTax
    });

    await syncPortfolioDividendTotals(req.user._id, dividend.script);

    return res.status(201).json({ dividend });
  } catch (error) {
    return res.status(500).json({ message: "Server error while adding dividend record" });
  }
};

export const getDividends = async (req, res) => {
  try {
    const dividends = await Dividend.find({ user: req.user._id }).sort({ script: 1, date: -1, createdAt: -1 });
    return res.status(200).json({ dividends });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching dividend records" });
  }
};

export const deleteDividend = async (req, res) => {
  try {
    const { id } = req.params;
    const dividend = await Dividend.findOneAndDelete({ _id: id, user: req.user._id });

    if (!dividend) {
      return res.status(404).json({ message: "Dividend record not found" });
    }

    await syncPortfolioDividendTotals(req.user._id, dividend.script);

    return res.status(200).json({ message: "Dividend record deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting dividend record" });
  }
};
