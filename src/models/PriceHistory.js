import mongoose from "mongoose";

const pricePointSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    price: { type: Number, required: true },
    volume: { type: Number, default: null },
  },
  { _id: false },
);

const priceHistorySchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    prices: {
      type: [pricePointSchema],
      default: [],
    },
    fetchedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, collection: "price_histories" },
);

export default mongoose.model("PriceHistory", priceHistorySchema);
