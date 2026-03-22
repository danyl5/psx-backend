import Watchlist from "../models/Watchlist.js";
import Script from "../models/Script.js";

export const getWatchlistRows = async (req, res) => {
  try {
    const rows = await Watchlist.find({ user: req.user._id })
      .sort({ orderNumber: 1, createdAt: 1 })
      .lean();

    const symbols = [...new Set(rows.map((row) => row.script).filter(Boolean))];
    const scripts = symbols.length
      ? await Script.find({ symbol: { $in: symbols } })
          .select("symbol sectorName name -_id")
          .lean()
      : [];

    const metaBySymbol = new Map(
      scripts.map((item) => [
        item.symbol,
        { sectorName: item.sectorName || "", name: item.name || "" }
      ])
    );

    const enriched = rows.map((row) => ({
      ...row,
      sector: metaBySymbol.get(row.script)?.sectorName || "",
      name: metaBySymbol.get(row.script)?.name || ""
    }));

    return res.status(200).json({ rows: enriched });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while fetching watchlist" });
  }
};

export const addWatchlistRow = async (req, res) => {
  try {
    const { script = "", orderNumber } = req.body;

    if (!script.trim()) {
      return res.status(400).json({ message: "Script is required" });
    }

    const normalizedScript = script.trim().toUpperCase();
    const matchedScript = await Script.findOne({ symbol: normalizedScript })
      .select("symbol -_id")
      .lean();

    if (!matchedScript) {
      return res.status(400).json({ message: "Invalid script" });
    }

    const maxOrderRow = await Watchlist.findOne({ user: req.user._id })
      .sort({ orderNumber: -1 })
      .select("orderNumber");
    const nextOrder = (maxOrderRow?.orderNumber || 0) + 1;

    const row = await Watchlist.create({
      user: req.user._id,
      script: normalizedScript,
      orderNumber:
        Number.isFinite(Number(orderNumber)) && Number(orderNumber) > 0
          ? Number(orderNumber)
          : nextOrder
    });

    return res.status(201).json({ row });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Script already exists" });
    }
    return res
      .status(500)
      .json({ message: "Server error while adding watchlist row" });
  }
};

export const reorderWatchlistRows = async (req, res) => {
  try {
    const { rowIds } = req.body;
    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({ message: "rowIds array is required" });
    }

    const uniqueRowIds = [...new Set(rowIds.map((id) => String(id)))];
    const rows = await Watchlist.find({
      user: req.user._id,
      _id: { $in: uniqueRowIds }
    }).select("_id");

    if (rows.length !== uniqueRowIds.length) {
      return res.status(400).json({ message: "One or more watchlist rows are invalid" });
    }

    const bulkOps = uniqueRowIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, user: req.user._id },
        update: { $set: { orderNumber: index + 1 } }
      }
    }));

    await Watchlist.bulkWrite(bulkOps, { ordered: true });
    const updatedRows = await Watchlist.find({ user: req.user._id }).sort({
      orderNumber: 1,
      createdAt: 1
    });
    return res.status(200).json({ rows: updatedRows });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while reordering watchlist rows" });
  }
};

export const deleteWatchlistRow = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Watchlist.findOneAndDelete({ _id: id, user: req.user._id });

    if (!row) {
      return res.status(404).json({ message: "Watchlist row not found" });
    }

    return res.status(200).json({ message: "Watchlist row deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error while deleting watchlist row" });
  }
};

