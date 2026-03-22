import mongoose from "mongoose";

const buyingHistorySchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: 0
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

const BuyingHistory = mongoose.model("BuyingHistory", buyingHistorySchema);

export default BuyingHistory;
