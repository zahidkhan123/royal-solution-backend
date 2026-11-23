import mongoose, { Document, Schema } from "mongoose";

/**
 * OTP interface
 */
export interface IOTP extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  /** Set once verify-otp succeeds; the code then only works for reset-password. */
  verifiedAt?: Date;
  createdAt: Date;
}

/**
 * OTP schema
 * OTP expires after 5 minutes
 */
const otpSchema = new Schema<IOTP>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: [true, "OTP is required"],
      minlength: [4, "OTP must be 4 digits"],
      maxlength: [4, "OTP must be 4 digits"],
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
    },
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Create index for faster lookups
otpSchema.index({ email: 1, otp: 1 });

const OTP = mongoose.model<IOTP>("OTP", otpSchema);

export default OTP;
