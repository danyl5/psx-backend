import mongoose from "mongoose";

const portfolioTabSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    portfolionumber: {
      type: Number,
      required: true,
      min: 1
    },
    name: {
      type: String,
      trim: true,
      required: true,
      default: "Portfolio 1"
    }
  },
  {
    timestamps: true
  }
);

portfolioTabSchema.index({ user: 1, portfolionumber: 1 }, { unique: true });

const PortfolioTab = mongoose.model("PortfolioTab", portfolioTabSchema);

export default PortfolioTab;
