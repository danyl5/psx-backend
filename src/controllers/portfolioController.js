import Portfolio from "../models/Portfolio.js";
import Script from "../models/Script.js";

const sanitizeNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    return 0;
  }
  return number;
};

export const getPortfolioRows = async (req, res) => {
  try {
    const rows = await Portfolio.find({ user: req.user._id }).sort({ orderNumber: 1, createdAt: 1 }).lean();
    const symbolsMissingSector = [...new Set(rows.filter((row) => !row.sector && row.script).map((row) => row.script))];

    if (!symbolsMissingSector.length) {
      const normalizedRows = rows.map((row) => ({
        ...row,
        dividendTotal: row.dividendTotal ?? row.dividend ?? 0,
        dividendAfterTax: row.dividendAfterTax ?? row.dividendTotal ?? row.dividend ?? 0
      }));
      return res.status(200).json({ rows: normalizedRows });
    }

    const scripts = await Script.find({ symbol: { $in: symbolsMissingSector } }).select("symbol sectorName -_id").lean();
    const sectorBySymbol = new Map(scripts.map((item) => [item.symbol, item.sectorName || ""]));
    const enrichedRows = rows.map((row) => ({
      ...row,
      sector: row.sector || sectorBySymbol.get(row.script) || "",
      dividendTotal: row.dividendTotal ?? row.dividend ?? 0,
      dividendAfterTax: row.dividendAfterTax ?? row.dividendTotal ?? row.dividend ?? 0
    }));
    return res.status(200).json({ rows: enrichedRows });
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
      orderNumber
    } = req.body;

    if (!script.trim()) {
      return res.status(400).json({ message: "Script is required" });
    }

    const normalizedScript = script.trim().toUpperCase();
    const matchedScript = await Script.findOne({ symbol: normalizedScript }).select("sectorName -_id").lean();

    const maxOrderRow = await Portfolio.findOne({ user: req.user._id }).sort({ orderNumber: -1 }).select("orderNumber");
    const nextOrder = (maxOrderRow?.orderNumber || 0) + 1;

    const row = await Portfolio.create({
      user: req.user._id,
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
    const { rowIds } = req.body;
    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({ message: "rowIds array is required" });
    }

    const uniqueRowIds = [...new Set(rowIds.map((id) => String(id)))];
    const rows = await Portfolio.find({ user: req.user._id, _id: { $in: uniqueRowIds } }).select("_id");
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
    const updatedRows = await Portfolio.find({ user: req.user._id }).sort({ orderNumber: 1, createdAt: 1 });
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
