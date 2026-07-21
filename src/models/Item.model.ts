import mongoose, { Document, Schema } from "mongoose";

export interface IItem extends Document {
  createdBy: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  unit: string;
  tax: number;
  defaultDiscount: number;
  /** Image URLs (max 10) */
  images: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IItem>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, maxlength: 2000 },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unit: {
      type: String,
      default: "unit",
      trim: true,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaultDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => !v || v.length <= 10,
        message: "Maximum 10 images allowed",
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

itemSchema.index({ createdBy: 1, name: 1 });
itemSchema.index({ name: "text", description: "text" });

export default mongoose.model<IItem>("Item", itemSchema);
