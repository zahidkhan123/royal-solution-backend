import mongoose, { Document, Schema } from "mongoose";
import { PROPERTY_TYPES } from "../constants/maintenance.js";

export interface IProperty extends Document {
  owner: mongoose.Types.ObjectId;
  name: string;
  type: string;
  address: string;
  country?: string;
  city?: string;
  postalCode?: string;
  description?: string;
  images: string[];
  documents: { name: string; url: string; uploadedAt: Date }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const propertySchema = new Schema<IProperty>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Property name is required"],
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: PROPERTY_TYPES,
      default: "apartment",
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    country: { type: String, trim: true },
    city: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },
    images: [{ type: String }],
    documents: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

propertySchema.index({ owner: 1, createdAt: -1 });
propertySchema.index({ name: "text", address: "text", city: "text" });

export default mongoose.model<IProperty>("Property", propertySchema);
