import mongoose from "mongoose";

const portfolioSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    script: {
      type: String,
      required: [true, "Script is required"],
      trim: true,
      uppercase: true
    },
    sector: {
      type: String,
      trim: true,
      default: ""
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: 0,
      default: 0
    },
    avgPrice: {
      type: Number,
      required: [true, "Avg price is required"],
      min: 0,
      default: 0
    },
    idealPercent: {
      type: Number,
      min: 0,
      default: 0
    },
    orderNumber: {
      type: Number,
      min: 1,
      default: 1
    },
    dividendTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    dividendAfterTax: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

const Portfolio = mongoose.model("Portfolio", portfolioSchema);

export default Portfolio;
