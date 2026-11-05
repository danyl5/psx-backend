import mongoose from "mongoose";

export const MUTUAL_FUND_TRANSACTION_TYPES = ["INVESTMENT", "WITHDRAWAL"];

const mutualFundTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fund: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MutualFund",
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: MUTUAL_FUND_TRANSACTION_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than zero"],
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
    },
  },
  { timestamps: true },
);

mutualFundTransactionSchema.index({
  user: 1,
  fund: 1,
  transactionDate: -1,
});

const MutualFundTransaction = mongoose.model(
  "MutualFundTransaction",
  mutualFundTransactionSchema,
);

export default MutualFundTransaction;
