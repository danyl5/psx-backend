import mongoose from "mongoose";

const budgetEntrySchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      min: 0,
      default: 0
    },
    tradePrice: {
      type: Number,
      min: 0,
      default: 0
    },
    totalAmount: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
);

const BudgetEntry = mongoose.model(
  "BudgetEntry", budgetEntrySchema
);

export default BudgetEntry;
