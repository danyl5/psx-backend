import mongoose from "mongoose";

const watchlistSchema = new mongoose.Schema(
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
    orderNumber: {
      type: Number,
      min: 1,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

watchlistSchema.index({ user: 1, script: 1 }, { unique: true });
watchlistSchema.index({ user: 1, orderNumber: 1, createdAt: 1 });

const Watchlist = mongoose.model("Watchlist", watchlistSchema);

export default Watchlist;
