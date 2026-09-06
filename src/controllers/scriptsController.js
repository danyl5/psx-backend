import { fetchScripts } from "../services/scriptService.js";

export const getScripts = async (req, res) => {
  try {
    const { q = "", limit = "1000" } = req.query;

    const data = await fetchScripts();
  
    const query = q.trim().toUpperCase();
    const maxLimit = Math.min(
      Math.max(parseInt(limit, 10) || 1000, 1),
      1000
    );

    let scripts = Array.isArray(data) ? data : [];

    if (query) {
      scripts = scripts.filter((item) => {
        const symbol = (item.symbol || "").toUpperCase();
        const name = (item.name || "").toUpperCase();

        return (
          symbol.includes(query) ||
          name.includes(query)
        );
      });
    }

    scripts = scripts.slice(0, maxLimit);

    return res.status(200).json({ scripts });
  } catch (error) {
    console.error("Error in getScripts:", error);

    if (error?.status === 429) {
      if (error.retryAfter) {
        res.set("Retry-After", String(error.retryAfter));
      }

      return res.status(503).json({
        message: "The scripts provider is temporarily rate-limited. Please retry later.",
        retryAfter: error.retryAfter,
      });
    }

    return res.status(502).json({
      message: "The scripts provider could not be reached.",
    });
  }
};