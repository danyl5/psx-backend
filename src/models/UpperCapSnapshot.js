import mongoose from "mongoose";

const upperCapSnapshotSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "latest",
      unique: true,
      index: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    calculatedAt: {
      type: Date,
      required: true,
    },
    results: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true, collection: "upper_cap_snapshots" },
);

export default mongoose.model("UpperCapSnapshot", upperCapSnapshotSchema);
