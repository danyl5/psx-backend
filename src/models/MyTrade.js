import mongoose from "mongoose";

const myTradeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    script: {
      type: String,
      required: [true, "Script is required"],
      trim: true,
      uppercase: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: 0,
      default: 0,
    },
    buyPrice: {
      type: Number,
      required: [true, "Buy price is required"],
      min: 0,
      default: 0,
    },
    sellPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    dividend: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

const MyTrade = mongoose.model("MyTrade", myTradeSchema);

export default MyTrade;

