import mongoose, { Document, Schema } from "mongoose";

export interface IBankAccount extends Document {
  createdBy: mongoose.Types.ObjectId;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string;
  swift?: string;
  branch?: string;
  routingNumber?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bankName: {
      type: String,
      required: [true, "Bank name is required"],
      trim: true,
    },
    accountHolder: {
      type: String,
      required: [true, "Account holder is required"],
      trim: true,
    },
    accountNumber: {
      type: String,
      required: [true, "Account number is required"],
      trim: true,
    },
    iban: { type: String, trim: true },
    swift: { type: String, trim: true },
    branch: { type: String, trim: true },
    routingNumber: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bankAccountSchema.index({ createdBy: 1, isDefault: -1 });

export default mongoose.model<IBankAccount>("BankAccount", bankAccountSchema);
