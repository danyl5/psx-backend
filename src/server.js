import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import budgetAllocationRoutes from "./routes/budgetAllocationRoutes.js";
import buyingHistoryRoutes from "./routes/buyingHistoryRoutes.js";
import dividendRoutes from "./routes/dividendRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import scriptsRoutes from "./routes/scriptsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import psxRoutes from "./routes/psxRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import myTradeRoutes from "./routes/myTradeRoutes.js";

dotenv.config();
connectDB();

const app = express();

app.use(
  cors({
    // Allow local frontend app; can be configured per environment.
    origin: process.env.CLIENT_URL || "http://localhost:1234"
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/my-trades", myTradeRoutes);
app.use("/api/scripts", scriptsRoutes);
app.use("/api/dividends", dividendRoutes);
app.use("/api/buying-history", buyingHistoryRoutes);
app.use("/api/budget-allocation", budgetAllocationRoutes);
app.use("/api/psx", psxRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
