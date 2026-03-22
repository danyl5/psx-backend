import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8
    },
    // 4-digit numeric pin used for password recovery.
    // Stored hashed with bcrypt (set during signup/forgot-password).
    // Not required for existing users created before this feature.
    pin: {
      type: String,
      minlength: [4, "Pin must be at least 4 characters"],
    },
    budgetAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    filer: {
      type: Boolean,
      required: [true, "Filer status is required"],
      default: true
    },
    zakatDeductible: {
      type: Boolean,
      required: [true, "Zakat deductible status is required"],
      default: true
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

export default User;
