import Dividend from "../models/Dividend.js";
import Portfolio from "../models/Portfolio.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

const parsePortfolioNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
};

const getPortfolioRowFilter = (userId, portfolionumber) => {
  if (portfolionumber === 1) {
    return {
      user: userId,
      $or: [
        { portfolionumber: 1 },
        { portfolionumber: "1" },
        { portfolionumber: { $exists: false } }
      ]
    };
  }
  return {
    user: userId,
    $or: [{ portfolionumber }, { portfolionumber: String(portfolionumber) }]
  };
};

const getDividendQuery = (userId, portfolionumber, script) => {
  const query = { user: userId };
  if (script) {
    query.script = script;
  }

  if (portfolionumber == null) {
    return query;
  }

  if (portfolionumber === 1) {
    query.$or = [
      { portfolionumber: 1 },
      { portfolionumber: "1" },
      { portfolionumber: { $exists: false } },
      { portfolionumber: null }
    ];
    return query;
  }

  query.$or = [
    { portfolionumber },
    { portfolionumber: String(portfolionumber) }
  ];
  return query;
};

export const getDividendTotalsByScript = async (userId, portfolionumber) => {
  const records = await Dividend.find(getDividendQuery(userId, portfolionumber))
    .select("script totalDividend totalAfterTax")
    .lean();

  const totalsByScript = new Map();
  records.forEach((record) => {
    const script = (record.script || "").toString().trim().toUpperCase();
    if (!script) {
      return;
    }
    const current = totalsByScript.get(script) || { totalDividend: 0, totalAfterTax: 0 };
    current.totalDividend += sanitizeNumber(record.totalDividend);
    current.totalAfterTax += sanitizeNumber(record.totalAfterTax);
    totalsByScript.set(script, current);
  });
  return totalsByScript;
};

const syncPortfolioDividendTotals = async (userId, script, portfolionumber) => {
  const normalizedScript = (script || "").toString().trim().toUpperCase();
  if (!normalizedScript) {
    return;
  }

  const records = await Dividend.find(
    getDividendQuery(userId, portfolionumber, normalizedScript)
  )
    .select("totalDividend totalAfterTax")
    .lean();

  const totals = records.reduce(
    (acc, record) => ({
      totalDividend: acc.totalDividend + sanitizeNumber(record.totalDividend),
      totalAfterTax: acc.totalAfterTax + sanitizeNumber(record.totalAfterTax)
    }),
    { totalDividend: 0, totalAfterTax: 0 }
  );

  const row = await Portfolio.findOne({
    ...getPortfolioRowFilter(userId, portfolionumber),
    script: normalizedScript
  });

  if (!row) {
    return;
  }

  row.dividendTotal = totals.totalDividend;
  row.dividendAfterTax = totals.totalAfterTax;
  await row.save();
};

export const addDividend = async (req, res) => {
  try {
    const { script = "", date, shares = 0, dividendPerShare = 0, portfolionumber } = req.body;

    if (!script.trim()) {
      return res.status(400).json({ message: "Script is required" });
    }
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }
    const parsedPortfolioNumber = parsePortfolioNumber(portfolionumber);
    if (!parsedPortfolioNumber) {
      return res.status(400).json({ message: "Please select a portfolio before saving." });
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
      totalAfterTax,
      portfolionumber: parsedPortfolioNumber
    });

    if (Number(dividend.portfolionumber) !== parsedPortfolioNumber) {
      dividend.portfolionumber = parsedPortfolioNumber;
      await dividend.save();
    }

    await syncPortfolioDividendTotals(req.user._id, dividend.script, parsedPortfolioNumber);

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

    await syncPortfolioDividendTotals(
      req.user._id,
      dividend.script,
      parsePortfolioNumber(dividend.portfolionumber)
    );

    return res.status(200).json({ message: "Dividend record deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting dividend record" });
  }
};
