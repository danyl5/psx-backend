import mongoose from "mongoose";

const scriptSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    sectorName: {
      type: String,
      default: "",
      trim: true
    },
    isETF: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    collection: "scripts"
  }
);

scriptSchema.index({ unique: true });

const Script = mongoose.model("Script", scriptSchema);

export default Script;
