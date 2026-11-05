import mongoose from "mongoose";
import MutualFund, {
  MUTUAL_FUND_RISK_CATEGORIES,
} from "../models/MutualFund.js";
import MutualFundTransaction, {
  MUTUAL_FUND_TRANSACTION_TYPES,
} from "../models/MutualFundTransaction.js";

const RISK_CATEGORIES = MUTUAL_FUND_RISK_CATEGORIES;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const BALANCE_TOLERANCE = 1e-8;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sendError = (res, error, operation) => {
  if (error instanceof RequestError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  if (error?.code === 11000) {
    return res.status(409).json({ message: "A conflicting record already exists" });
  }

  console.error(`Mutual funds ${operation} failed:`, error);
  return res.status(500).json({ message: "Server error while processing mutual funds request" });
};

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const requireObjectId = (value, label) => {
  if (!isValidObjectId(value)) {
    throw new RequestError(400, `${label} is invalid`);
  }
};

const normalizeRiskCategory = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+RISK$/, "");

  if (!RISK_CATEGORIES.includes(normalized)) {
    throw new RequestError(400, "Risk category must be Low, Medium, or High");
  }

  return normalized;
};

const normalizeTransactionType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!MUTUAL_FUND_TRANSACTION_TYPES.includes(normalized)) {
    throw new RequestError(400, "Transaction type must be Investment or Withdrawal");
  }
  return normalized;
};

const normalizeAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.01) {
    throw new RequestError(400, "Amount must be at least 0.01");
  }
  return amount;
};

const normalizeDate = (value, label = "Transaction date") => {
  if (value === undefined || value === null || value === "") {
    throw new RequestError(400, `${label} is required`);
  }

  const dateText = typeof value === "string" ? value.trim() : "";
  const date = new Date(value);
  if (
    Number.isNaN(date.getTime()) ||
    (/^\d{4}-\d{2}-\d{2}$/.test(dateText) &&
      date.toISOString().slice(0, 10) !== dateText)
  ) {
    throw new RequestError(400, `${label} is invalid`);
  }
  return date;
};

const normalizeText = (value, label, { required = false, maxLength } = {}) => {
  const text = String(value ?? "").trim();
  if (required && !text) {
    throw new RequestError(400, `${label} is required`);
  }
  if (maxLength && text.length > maxLength) {
    throw new RequestError(400, `${label} cannot exceed ${maxLength} characters`);
  }
  return text;
};

const getPagination = (query) => {
  const page = query.page === undefined ? DEFAULT_PAGE : Number(query.page);
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw new RequestError(400, "Page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RequestError(400, `Limit must be between 1 and ${MAX_LIMIT}`);
  }

  return { page, limit, skip: (page - 1) * limit };
};

const parseDateFilter = (value, label, endOfDay = false) => {
  if (value === undefined) return undefined;
  const date = normalizeDate(value, label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (date.toISOString().slice(0, 10) !== value) {
      throw new RequestError(400, `${label} is invalid`);
    }
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  }
  return date;
};

const getFundNetBalance = async (
  userId,
  fundId,
  excludedTransactionId,
) => {
  const match = { user: userId, fund: fundId };
  if (excludedTransactionId) match._id = { $ne: excludedTransactionId };

  const [result] = await MutualFundTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [
              { $eq: ["$transactionType", "INVESTMENT"] },
              "$amount",
              { $multiply: ["$amount", -1] },
            ],
          },
        },
      },
    },
  ]);

  return result?.balance || 0;
};

const ensureNonNegativeBalance = (balance, transactionType, amount) => {
  const resultingBalance =
    balance + (transactionType === "INVESTMENT" ? amount : -amount);
  if (resultingBalance < -BALANCE_TOLERANCE) {
    throw new RequestError(400, "Withdrawal exceeds the available fund balance");
  }
};

const getTransactionTotalsByFund = async (userId) =>
  MutualFundTransaction.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: "$fund",
        totalInvested: {
          $sum: {
            $cond: [
              { $eq: ["$transactionType", "INVESTMENT"] },
              "$amount",
              0,
            ],
          },
        },
        totalWithdrawn: {
          $sum: {
            $cond: [
              { $eq: ["$transactionType", "WITHDRAWAL"] },
              "$amount",
              0,
            ],
          },
        },
        transactionCount: { $sum: 1 },
        lastTransactionDate: { $max: "$transactionDate" },
      },
    },
  ]);

const getFundSummaries = (funds, transactionTotals) => {
  const totalsByFundId = new Map(
    transactionTotals.map((item) => [String(item._id), item]),
  );

  return funds.map((fund) => {
    const totals = totalsByFundId.get(String(fund._id));
    const totalInvested = totals?.totalInvested || 0;
    const totalWithdrawn = totals?.totalWithdrawn || 0;

    return {
      fundId: fund._id,
      amcName: fund.amcName,
      fundName: fund.fundName,
      fundCode: fund.fundCode,
      riskCategory: fund.riskCategory,
      isActive: fund.isActive,
      totalInvested,
      totalWithdrawn,
      currentInvestedBalance: totalInvested - totalWithdrawn,
      transactionCount: totals?.transactionCount || 0,
      lastTransactionDate: totals?.lastTransactionDate || null,
    };
  });
};

const createFundPayload = (body) => ({
  amcName: normalizeText(body.amcName, "AMC name", {
    required: true,
    maxLength: 120,
  }),
  fundName: normalizeText(body.fundName, "Fund name", {
    required: true,
    maxLength: 160,
  }),
  fundCode: normalizeText(body.fundCode, "Fund code", {
    maxLength: 40,
  }).toUpperCase(),
  riskCategory: normalizeRiskCategory(body.riskCategory),
});

const ensureUniqueFund = async (
  userId,
  amcName,
  fundName,
  excludedFundId,
  { activeOnly = false } = {},
) => {
  const filter = { user: userId, amcName, fundName };
  if (excludedFundId) filter._id = { $ne: excludedFundId };
  if (activeOnly) filter.isActive = true;

  const duplicate = await MutualFund.findOne(filter)
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean();
  if (duplicate) {
    throw new RequestError(
      409,
      activeOnly
        ? "An active fund with this AMC and name already exists"
        : "A fund with this AMC and name already exists. Restore the archived fund instead.",
    );
  }
};

const createTransactionPayload = (body) => {
  requireObjectId(body.fundId, "Fund");
  return {
    fund: new mongoose.Types.ObjectId(body.fundId),
    transactionType: normalizeTransactionType(body.transactionType),
    amount: normalizeAmount(body.amount),
    transactionDate: normalizeDate(body.transactionDate),
  };
};

const createTransactionFilter = (query, userId) => {
  const filter = { user: userId };

  if (query.transactionType) {
    filter.transactionType = normalizeTransactionType(query.transactionType);
  }
  if (query.fundId) {
    requireObjectId(query.fundId, "Fund");
    filter.fund = query.fundId;
  }

  const startDate = parseDateFilter(query.startDate, "Start date");
  const endDate = parseDateFilter(query.endDate, "End date", true);
  if (startDate && endDate && startDate > endDate) {
    throw new RequestError(400, "Start date must not be after end date");
  }
  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = startDate;
    if (endDate) filter.transactionDate.$lte = endDate;
  }

  return filter;
};

export const createMutualFund = async (req, res) => {
  try {
    const payload = createFundPayload(req.body || {});
    await ensureUniqueFund(
      req.user._id,
      payload.amcName,
      payload.fundName,
    );
    const fund = await MutualFund.create({
      user: req.user._id,
      ...payload,
    });
    return res.status(201).json({ fund });
  } catch (error) {
    return sendError(res, error, "fund creation");
  }
};

export const getMutualFunds = async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.includeArchived !== "true") filter.isActive = true;
    if (req.query.riskCategory) {
      filter.riskCategory = normalizeRiskCategory(req.query.riskCategory);
    }

    const funds = await MutualFund.find(filter).sort({ fundName: 1 }).lean();
    return res.status(200).json({ funds });
  } catch (error) {
    return sendError(res, error, "fund list");
  }
};

export const getMutualFundDetails = async (req, res) => {
  try {
    const { fundId } = req.params;
    requireObjectId(fundId, "Fund");
    const { page, limit, skip } = getPagination(req.query);
    const fund = await MutualFund.findOne({
      _id: fundId,
      user: req.user._id,
    }).lean();
    if (!fund) throw new RequestError(404, "Mutual fund not found");

    const filter = { user: req.user._id, fund: fund._id };
    const [transactionTotals, transactionCount, transactions] =
      await Promise.all([
        getTransactionTotalsByFund(req.user._id).then((rows) =>
          rows.filter((row) => String(row._id) === String(fund._id)),
        ),
        MutualFundTransaction.countDocuments(filter),
        MutualFundTransaction.find(filter)
          .select("-notes")
          .sort({ transactionDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

    const summary = getFundSummaries([fund], transactionTotals)[0];
    return res.status(200).json({
      fund,
      summary: {
        totalInvested: summary.totalInvested,
        totalWithdrawn: summary.totalWithdrawn,
        currentInvestedBalance: summary.currentInvestedBalance,
        transactionCount: summary.transactionCount,
        lastTransactionDate: summary.lastTransactionDate,
      },
      transactions: { items: transactions, total: transactionCount, page, limit },
    });
  } catch (error) {
    return sendError(res, error, "fund details");
  }
};

export const updateMutualFund = async (req, res) => {
  try {
    const { fundId } = req.params;
    requireObjectId(fundId, "Fund");

    const fund = await MutualFund.findOne({
      _id: fundId,
      user: req.user._id,
    });
    if (!fund) throw new RequestError(404, "Mutual fund not found");

    const body = req.body || {};
    if (body.amcName !== undefined) {
      fund.amcName = normalizeText(body.amcName, "AMC name", {
        required: true,
        maxLength: 120,
      });
    }
    if (body.fundName !== undefined) {
      fund.fundName = normalizeText(body.fundName, "Fund name", {
        required: true,
        maxLength: 160,
      });
    }
    if (body.fundCode !== undefined) {
      fund.fundCode = normalizeText(body.fundCode, "Fund code", {
        maxLength: 40,
      }).toUpperCase();
    }
    if (body.riskCategory !== undefined) {
      fund.riskCategory = normalizeRiskCategory(body.riskCategory);
    }

    if (
      fund.isModified("amcName") ||
      fund.isModified("fundName")
    ) {
      await ensureUniqueFund(
        req.user._id,
        fund.amcName,
        fund.fundName,
        fund._id,
      );
    }

    await fund.save();
    return res.status(200).json({ fund });
  } catch (error) {
    return sendError(res, error, "fund update");
  }
};

export const archiveMutualFund = async (req, res) => {
  try {
    const { fundId } = req.params;
    requireObjectId(fundId, "Fund");
    const fund = await MutualFund.findOneAndUpdate(
      { _id: fundId, user: req.user._id, isActive: true },
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );
    if (!fund) throw new RequestError(404, "Active mutual fund not found");
    return res.status(200).json({ message: "Mutual fund archived", fund });
  } catch (error) {
    return sendError(res, error, "fund archive");
  }
};

export const restoreMutualFund = async (req, res) => {
  try {
    const { fundId } = req.params;
    requireObjectId(fundId, "Fund");
    const archivedFund = await MutualFund.findOne({
      _id: fundId,
      user: req.user._id,
      isActive: false,
    });
    if (!archivedFund) {
      throw new RequestError(404, "Archived mutual fund not found");
    }

    await ensureUniqueFund(
      req.user._id,
      archivedFund.amcName,
      archivedFund.fundName,
      archivedFund._id,
      { activeOnly: true },
    );
    archivedFund.isActive = true;
    await archivedFund.save();
    return res.status(200).json({
      message: "Mutual fund restored",
      fund: archivedFund,
    });
  } catch (error) {
    return sendError(res, error, "fund restore");
  }
};

export const createMutualFundTransaction = async (req, res) => {
  try {
    const payload = createTransactionPayload(req.body || {});
    const fund = await MutualFund.findOne({
      _id: payload.fund,
      user: req.user._id,
    });
    if (!fund) throw new RequestError(404, "Mutual fund not found");
    if (!fund.isActive && payload.transactionType !== "WITHDRAWAL") {
      throw new RequestError(400, "Archived mutual funds only allow withdrawals");
    }

    const balance = await getFundNetBalance(req.user._id, payload.fund);
    ensureNonNegativeBalance(balance, payload.transactionType, payload.amount);

    const transaction = await MutualFundTransaction.create({
      ...payload,
      user: req.user._id,
    });
    return res.status(201).json({ transaction });
  } catch (error) {
    return sendError(res, error, "transaction creation");
  }
};

export const getMutualFundTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = createTransactionFilter(req.query, req.user._id);
    const [transactions, total] = await Promise.all([
      MutualFundTransaction.find(filter)
        .select("-notes")
        .populate("fund", "amcName fundName fundCode riskCategory isActive")
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MutualFundTransaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      transactions,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return sendError(res, error, "transaction list");
  }
};

export const getMutualFundTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    requireObjectId(transactionId, "Transaction");
    const transaction = await MutualFundTransaction.findOne({
      _id: transactionId,
      user: req.user._id,
    })
      .select("-notes")
      .populate("fund", "amcName fundName fundCode riskCategory isActive")
      .lean();
    if (!transaction) {
      throw new RequestError(404, "Mutual fund transaction not found");
    }
    return res.status(200).json({ transaction });
  } catch (error) {
    return sendError(res, error, "transaction details");
  }
};

export const updateMutualFundTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    requireObjectId(transactionId, "Transaction");
    const body = req.body || {};

    const existing = await MutualFundTransaction.findOne({
      _id: transactionId,
      user: req.user._id,
    }).select("-notes");
    if (!existing) {
      throw new RequestError(404, "Mutual fund transaction not found");
    }

    const previousFundId = String(existing.fund);
    const nextFundId = body.fundId === undefined ? existing.fund : body.fundId;
    requireObjectId(nextFundId, "Fund");
    const nextFundObjectId = new mongoose.Types.ObjectId(nextFundId);
    const nextFundIdString = String(nextFundObjectId);
    const fundIds = [...new Set([previousFundId, nextFundIdString])];
    const funds = await MutualFund.find({
      _id: { $in: fundIds },
      user: req.user._id,
    });
    if (funds.length !== fundIds.length) {
      throw new RequestError(404, "Mutual fund not found");
    }
    const nextType =
      body.transactionType === undefined
        ? existing.transactionType
        : normalizeTransactionType(body.transactionType);
    const nextAmount =
      body.amount === undefined ? existing.amount : normalizeAmount(body.amount);
    const nextFund = funds.find(
      (fund) => String(fund._id) === nextFundIdString,
    );
    if (!nextFund.isActive && nextType !== "WITHDRAWAL") {
      throw new RequestError(400, "Archived mutual funds only allow withdrawals");
    }

    if (nextFundIdString !== previousFundId) {
      const previousFundBalance = await getFundNetBalance(
        req.user._id,
        previousFundId,
        existing._id,
      );
      if (previousFundBalance < -BALANCE_TOLERANCE) {
        throw new RequestError(
          400,
          "This edit would leave the original fund with a negative balance",
        );
      }
    }

    const nextFundBalance = await getFundNetBalance(
      req.user._id,
      nextFundObjectId,
      existing._id,
    );
    ensureNonNegativeBalance(nextFundBalance, nextType, nextAmount);

    if (body.fundId !== undefined) existing.fund = nextFundObjectId;
    existing.transactionType = nextType;
    existing.amount = nextAmount;
    if (body.transactionDate !== undefined) {
      existing.transactionDate = normalizeDate(body.transactionDate);
    }

    await existing.save();
    const transaction = existing;
    return res.status(200).json({ transaction });
  } catch (error) {
    return sendError(res, error, "transaction update");
  }
};

export const deleteMutualFundTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    requireObjectId(transactionId, "Transaction");
    const transaction = await MutualFundTransaction.findOne({
      _id: transactionId,
      user: req.user._id,
    }).select("-notes");
    if (!transaction) {
      throw new RequestError(404, "Mutual fund transaction not found");
    }

    const fundId = String(transaction.fund);
    const fund = await MutualFund.findOne({
      _id: fundId,
      user: req.user._id,
    }).select("_id");
    if (!fund) throw new RequestError(404, "Mutual fund not found");

    if (transaction.transactionType === "INVESTMENT") {
      const resultingBalance = await getFundNetBalance(
        req.user._id,
        fundId,
        transaction._id,
      );
      if (resultingBalance < -BALANCE_TOLERANCE) {
        throw new RequestError(
          400,
          "This investment cannot be deleted because the fund has withdrawals that depend on it",
        );
      }
    }

    await transaction.deleteOne();
    return res.status(200).json({ message: "Transaction deleted successfully" });
  } catch (error) {
    return sendError(res, error, "transaction deletion");
  }
};

export const getMutualFundDashboard = async (req, res) => {
  try {
    const [funds, transactionTotals, recentTransactions] = await Promise.all([
      MutualFund.find({ user: req.user._id }).sort({ fundName: 1 }).lean(),
      getTransactionTotalsByFund(req.user._id),
      MutualFundTransaction.find({ user: req.user._id })
        .select("-notes")
        .populate("fund", "amcName fundName fundCode riskCategory")
        .sort({ transactionDate: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const fundSummaries = getFundSummaries(funds, transactionTotals);
    const summary = fundSummaries.reduce(
      (totals, fund) => ({
        totalInvested: totals.totalInvested + fund.totalInvested,
        totalWithdrawn: totals.totalWithdrawn + fund.totalWithdrawn,
        netInvestedBalance:
          totals.netInvestedBalance + fund.currentInvestedBalance,
      }),
      { totalInvested: 0, totalWithdrawn: 0, netInvestedBalance: 0 },
    );
    const riskAllocation = RISK_CATEGORIES.map((riskCategory) => {
      const balance = fundSummaries
        .filter((fund) => fund.riskCategory === riskCategory)
        .reduce((total, fund) => total + fund.currentInvestedBalance, 0);

      return {
        riskCategory,
        balance,
        percentage:
          summary.netInvestedBalance > 0
            ? (balance / summary.netInvestedBalance) * 100
            : 0,
      };
    });

    return res.status(200).json({
      summary,
      riskAllocation,
      funds: fundSummaries,
      recentTransactions,
    });
  } catch (error) {
    return sendError(res, error, "dashboard");
  }
};
