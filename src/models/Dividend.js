import mongoose from "mongoose";

const dividendSchema = new mongoose.Schema(
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
      uppercase: true,
      index: true
    },
    date: {
      type: Date,
      required: [true, "Date is required"]
    },
    shares: {
      type: Number,
      required: [true, "Shares are required"],
      min: 0
    },
    dividendPerShare: {
      type: Number,
      required: [true, "Dividend per share is required"],
      min: 0
    },
    totalDividend: {
      type: Number,
      required: true,
      min: 0
    },
    taxPercent: {
      type: Number,
      required: true,
      enum: [15, 30],
      default: 15
    },
    totalAfterTax: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

const Dividend = mongoose.model("Dividend", dividendSchema);

export default Dividend;
