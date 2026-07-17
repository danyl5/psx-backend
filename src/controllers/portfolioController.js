import Portfolio from "../models/Portfolio.js";
import PortfolioTab from "../models/PortfolioTab.js";
import Script from "../models/Script.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

const parsePortfolioNumber = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
};

const getPortfolioRowFilter = (userId, portfolionumber) => {
  const normalizedNumber = parsePortfolioNumber(portfolionumber);
  if (normalizedNumber === 1) {
    return {
      user: userId,
      $or: [{ portfolionumber: 1 }, { portfolionumber: { $exists: false } }]
    };
  }
  return { user: userId, portfolionumber: normalizedNumber };
};

const ensureDefaultPortfolioTab = async (userId) => {
  let tabs = await PortfolioTab.find({ user: userId }).sort({ portfolionumber: 1 }).lean();

  if (!tabs.length) {
    const defaultTab = await PortfolioTab.create({
      user: userId,
      portfolionumber: 1,
      name: "Portfolio 1"
    });
    tabs = [defaultTab.toObject()];
  }

  const defaultTab = tabs.find((tab) => tab.portfolionumber === 1);
  if (!defaultTab) {
    const createdDefault = await PortfolioTab.create({ user: userId, portfolionumber: 1, name: "Portfolio 1" });
    tabs = [createdDefault.toObject(), ...tabs].sort((a, b) => a.portfolionumber - b.portfolionumber);
  }

  const nameByNumber = new Map(tabs.map((tab) => [tab.portfolionumber, tab.name]));
  await Portfolio.updateMany(
    { user: userId, portfolionumber: { $exists: false } },
    { $set: { portfolionumber: 1, portfolioName: nameByNumber.get(1) || "Portfolio 1" } }
  );
  await Promise.all(
    tabs.map((tab) => Portfolio.updateMany(
      { user: userId, portfolionumber: tab.portfolionumber, portfolioName: { $exists: false } },
      { $set: { portfolioName: tab.name } }
    ))
  );

  return tabs;
};

const normalizePortfolioRows = (rows) =>
  rows.map((row) => ({
    ...row,
    portfolionumber: row.portfolionumber ?? 1,
    dividendTotal: row.dividendTotal ?? row.dividend ?? 0,
    dividendAfterTax: row.dividendAfterTax ?? row.dividendTotal ?? row.dividend ?? 0
  }));

export const getPortfolioTabs = async (req, res) => {
  try {
    const tabs = await ensureDefaultPortfolioTab(req.user._id);
    return res.status(200).json({ tabs });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching portfolio tabs" });
  }
};

export const createPortfolioTab = async (req, res) => {
  try {
    const { name = "" } = req.body;
    const tabs = await ensureDefaultPortfolioTab(req.user._id);
    const nextPortfolioNumber = Math.max(...tabs.map((tab) => tab.portfolionumber), 0) + 1;
    const trimmedName = name.trim() || `Portfolio ${nextPortfolioNumber}`;

    const tab = await PortfolioTab.create({
      user: req.user._id,
      portfolionumber: nextPortfolioNumber,
      name: trimmedName
    });

    return res.status(201).json({ tab });
  } catch (error) {
    return res.status(500).json({ message: "Server error while creating portfolio tab" });
  }
};

export const updatePortfolioTab = async (req, res) => {
  try {
    const portfolionumber = parsePortfolioNumber(req.params.portfolionumber);
    const { name } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Portfolio name is required" });
    }

    const tab = await PortfolioTab.findOneAndUpdate(
      { user: req.user._id, portfolionumber },
      { name: name.trim() },
      { new: true, runValidators: true }
    );

    if (!tab) {
      return res.status(404).json({ message: "Portfolio tab not found" });
    }

    await Portfolio.updateMany(
      getPortfolioRowFilter(req.user._id, portfolionumber),
      { $set: { portfolioName: tab.name } }
    );

    return res.status(200).json({ tab });
  } catch (error) {
    return res.status(500).json({ message: "Server error while updating portfolio tab" });
  }
};

export const deletePortfolioTab = async (req, res) => {
  try {
    const portfolionumber = parsePortfolioNumber(req.params.portfolionumber);
    const tabs = await ensureDefaultPortfolioTab(req.user._id);

    if (tabs.length <= 1) {
      return res.status(400).json({ message: "You must keep at least one portfolio" });
    }

    const tab = tabs.find((item) => item.portfolionumber === portfolionumber);
    if (!tab) {
      return res.status(404).json({ message: "Portfolio tab not found" });
    }

    await Portfolio.deleteMany(getPortfolioRowFilter(req.user._id, portfolionumber));
    await PortfolioTab.deleteOne({ user: req.user._id, portfolionumber });

    const remainingTabs = await PortfolioTab.find({ user: req.user._id }).sort({ portfolionumber: 1 }).lean();
    return res.status(200).json({ message: "Portfolio deleted successfully", tabs: remainingTabs });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting portfolio tab" });
  }
};

export const getPortfolioRows = async (req, res) => {
  try {
    const portfolionumber = parsePortfolioNumber(req.query.portfolionumber, 1);
    const tabs = await ensureDefaultPortfolioTab(req.user._id);
    const tab = tabs.find((item) => item.portfolionumber === portfolionumber);
    if (!tab) {
      return res.status(404).json({ message: "Portfolio tab not found" });
    }

    const rows = await Portfolio.find(getPortfolioRowFilter(req.user._id, portfolionumber))
      .sort({ orderNumber: 1, createdAt: 1 })
      .lean();

    const symbolsMissingSector = [...new Set(rows.filter((row) => !row.sector && row.script).map((row) => row.script))];

    if (!symbolsMissingSector.length) {
      return res.status(200).json({ rows: normalizePortfolioRows(rows).map((row) => ({ ...row, portfolioName: row.portfolioName || tab.name })), portfolionumber });
    }

    const scripts = await Script.find({ symbol: { $in: symbolsMissingSector } }).select("symbol sectorName -_id").lean();
    const sectorBySymbol = new Map(scripts.map((item) => [item.symbol, item.sectorName || ""]));
    const enrichedRows = rows.map((row) => ({
      ...row,
      sector: row.sector || sectorBySymbol.get(row.script) || ""
    }));

    return res.status(200).json({ rows: normalizePortfolioRows(enrichedRows).map((row) => ({ ...row, portfolioName: row.portfolioName || tab.name })), portfolionumber });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching portfolio" });
  }
};

export const addPortfolioRow = async (req, res) => {
  try {
    const {
      script = "",
      quantity = 0,
      avgPrice = 0,
      idealPercent = 0,
      dividend = 0,
      dividendTotal = 0,
      dividendAfterTax = 0,
      orderNumber,
      portfolionumber = 1
    } = req.body;

    if (!script.trim()) {
      return res.status(400).json({ message: "Script is required" });
    }

    const normalizedPortfolioNumber = parsePortfolioNumber(portfolionumber, 1);
    const tabs = await ensureDefaultPortfolioTab(req.user._id);
    const portfolioTab = tabs.find((tab) => tab.portfolionumber === normalizedPortfolioNumber);
    if (!portfolioTab) return res.status(404).json({ message: "Portfolio tab not found" });

    const normalizedScript = script.trim().toUpperCase();
    const matchedScript = await Script.findOne({ symbol: normalizedScript }).select("sectorName -_id").lean();

    const maxOrderRow = await Portfolio.findOne(getPortfolioRowFilter(req.user._id, normalizedPortfolioNumber))
      .sort({ orderNumber: -1 })
      .select("orderNumber");
    const nextOrder = (maxOrderRow?.orderNumber || 0) + 1;

    const row = await Portfolio.create({
      user: req.user._id,
      portfolionumber: normalizedPortfolioNumber,
      portfolioName: portfolioTab.name,
      script: normalizedScript,
      sector: matchedScript?.sectorName || "",
      quantity: sanitizeNumber(quantity),
      avgPrice: sanitizeNumber(avgPrice),
      idealPercent: sanitizeNumber(idealPercent),
      dividendTotal: sanitizeNumber(dividendTotal || dividend),
      dividendAfterTax: sanitizeNumber(dividendAfterTax || dividendTotal || dividend),
      orderNumber: Number.isFinite(Number(orderNumber)) && Number(orderNumber) > 0 ? Number(orderNumber) : nextOrder
    });

    return res.status(201).json({ row });
  } catch (error) {
    return res.status(500).json({ message: "Server error while adding portfolio row" });
  }
};

export const updatePortfolioRow = async (req, res) => {
  try {
    const { id } = req.params;
    const { script, quantity, avgPrice, idealPercent, dividend, dividendTotal, dividendAfterTax, orderNumber } = req.body;

    const row = await Portfolio.findOne({ _id: id, user: req.user._id });
    if (!row) {
      return res.status(404).json({ message: "Portfolio row not found" });
    }

    if (typeof script === "string") {
      if (!script.trim()) {
        return res.status(400).json({ message: "Script is required" });
      }
      row.script = script.trim().toUpperCase();
      const matchedScript = await Script.findOne({ symbol: row.script }).select("sectorName -_id").lean();
      row.sector = matchedScript?.sectorName || "";
    }

    if (quantity !== undefined) {
      row.quantity = sanitizeNumber(quantity);
    }

    if (avgPrice !== undefined) {
      row.avgPrice = sanitizeNumber(avgPrice);
    }

    if (idealPercent !== undefined) {
      row.idealPercent = sanitizeNumber(idealPercent);
    }

    if (dividendTotal !== undefined || dividend !== undefined) {
      row.dividendTotal = sanitizeNumber(dividendTotal !== undefined ? dividendTotal : dividend);
    }

    if (dividendAfterTax !== undefined) {
      row.dividendAfterTax = sanitizeNumber(dividendAfterTax);
    }

    if (orderNumber !== undefined) {
      const parsedOrder = Number(orderNumber);
      if (Number.isFinite(parsedOrder) && parsedOrder > 0) {
        row.orderNumber = parsedOrder;
      }
    }

    await row.save();
    return res.status(200).json({ row });
  } catch (error) {
    return res.status(500).json({ message: "Server error while updating portfolio row" });
  }
};

export const reorderPortfolioRows = async (req, res) => {
  try {
    const { rowIds, portfolionumber = 1 } = req.body;
    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({ message: "rowIds array is required" });
    }

    const normalizedPortfolioNumber = parsePortfolioNumber(portfolionumber, 1);
    const uniqueRowIds = [...new Set(rowIds.map((id) => String(id)))];
    const rows = await Portfolio.find({
      ...getPortfolioRowFilter(req.user._id, normalizedPortfolioNumber),
      _id: { $in: uniqueRowIds }
    }).select("_id");

    if (rows.length !== uniqueRowIds.length) {
      return res.status(400).json({ message: "One or more portfolio rows are invalid" });
    }

    const bulkOps = uniqueRowIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, user: req.user._id },
        update: { $set: { orderNumber: index + 1 } }
      }
    }));

    await Portfolio.bulkWrite(bulkOps, { ordered: true });
    const updatedRows = await Portfolio.find(getPortfolioRowFilter(req.user._id, normalizedPortfolioNumber)).sort({
      orderNumber: 1,
      createdAt: 1
    });
    return res.status(200).json({ rows: updatedRows });
  } catch (error) {
    return res.status(500).json({ message: "Server error while reordering portfolio rows" });
  }
};

export const deletePortfolioRow = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Portfolio.findOneAndDelete({ _id: id, user: req.user._id });

    if (!row) {
      return res.status(404).json({ message: "Portfolio row not found" });
    }

    return res.status(200).json({ message: "Portfolio row deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error while deleting portfolio row" });
  }
};
