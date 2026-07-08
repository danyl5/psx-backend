import { fetchScripts } from "../services/scriptService.js";

export const getScripts = async (req, res) => {
  try {
    const { q = "", limit = "5000" } = req.query;
    const data = await fetchScripts();
    const query = q.toString().trim().toUpperCase();
    const maxLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 5000, 1), 5000);

    // Keep only non-debt scripts
    let scripts = (Array.isArray(data) ? data : []).filter(
      (item) => !item.isDebt
    );

    if (query) {
      scripts = scripts.filter((item) => {
        const symbol = (item.symbol || "").toUpperCase();
        const name = (item.name || "").toUpperCase();
        return symbol.includes(query) || name.includes(query);
      });
    }

    scripts = scripts.slice(0, maxLimit);

    return res.status(200).json({ scripts });
  } catch (error) {
    console.error("Error in getScripts controller:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch scripts from PSX." });
  }
};