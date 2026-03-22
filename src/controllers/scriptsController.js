import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Script from "../models/Script.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsFilePath = path.resolve(__dirname, "../assets/Scripts.json");

export const importScriptsFromFile = async (req, res) => {
  try {
    const fileContent = await readFile(scriptsFilePath, "utf-8");
    const parsed = JSON.parse(fileContent);

    if (!Array.isArray(parsed)) {
      return res.status(400).json({ message: "Scripts.json must contain an array of script objects." });
    }

    const validRows = parsed
      .map((item) => {
        const symbol = (item?.symbol || "").toString().trim().toUpperCase();
        const rawName = (item?.name || "").toString().trim();
        return {
          symbol,
          name: rawName || symbol,
          sectorName: (item?.sectorName || "").toString().trim(),
          isETF: Boolean(item?.isETF)
        };
      })
      .filter((item) => item.symbol);

    if (!validRows.length) {
      return res.status(400).json({ message: "No valid script records found in Scripts.json." });
    }

    const bulkOps = validRows.map((row) => ({
      updateOne: {
        filter: { symbol: row.symbol },
        update: {
          $set: row,
          $unset: {
            isDebt: "",
            isGEM: ""
          }
        },
        upsert: true
      }
    }));

    const writeResult = await Script.bulkWrite(bulkOps, { ordered: false });
    const total = await Script.countDocuments();

    return res.status(200).json({
      message: "Scripts import completed successfully.",
      inserted: writeResult.upsertedCount || 0,
      updated: writeResult.modifiedCount || 0,
      total
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error while importing scripts.",
      details: error.message
    });
  }
};

export const getScripts = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);

    const query = q
      ? {
          $or: [{ symbol: { $regex: q, $options: "i" } }, { name: { $regex: q, $options: "i" } }]
        }
      : {};

    const scripts = await Script.find(query).sort({ symbol: 1 }).limit(limit);

    return res.status(200).json({
      count: scripts.length,
      scripts
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error while fetching scripts." });
  }
};
