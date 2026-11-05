import mongoose from "mongoose";

export const MUTUAL_FUND_RISK_CATEGORIES = ["LOW", "MEDIUM", "HIGH"];

const mutualFundSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amcName: {
      type: String,
      required: [true, "AMC name is required"],
      trim: true,
      maxlength: [120, "AMC name cannot exceed 120 characters"],
    },
    fundName: {
      type: String,
      required: [true, "Fund name is required"],
      trim: true,
      maxlength: [160, "Fund name cannot exceed 160 characters"],
    },
    fundCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [40, "Fund code cannot exceed 40 characters"],
      default: "",
    },
    riskCategory: {
      type: String,
      enum: MUTUAL_FUND_RISK_CATEGORIES,
      required: [true, "Risk category is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

mutualFundSchema.index({ user: 1, isActive: 1, fundName: 1 });

const MutualFund = mongoose.model("MutualFund", mutualFundSchema);

export default MutualFund;
