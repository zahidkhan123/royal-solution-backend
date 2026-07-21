import mongoose, { Document, Schema } from "mongoose";

export interface IClient extends Document {
  /** Contractor/admin who owns this client record */
  createdBy: mongoose.Types.ObjectId;
  /** Optional link to app user (property owner) */
  user?: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  billingAddress?: {
    country?: string;
    street?: string;
    apartment?: string;
    city?: string;
    postalCode?: string;
  };
  taxRegistrationNo?: string;
  vatNumber?: string;
  contactPerson?: string;
  phone?: string;
  fax?: string;
  cell?: string;
  website?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const clientSchema = new Schema<IClient>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    billingAddress: {
      country: String,
      street: String,
      apartment: String,
      city: String,
      postalCode: String,
    },
    taxRegistrationNo: { type: String, trim: true },
    vatNumber: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    fax: { type: String, trim: true },
    cell: { type: String, trim: true },
    website: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

clientSchema.index({ createdBy: 1, name: 1 });
clientSchema.index({ name: "text", email: "text", contactPerson: "text" });

export default mongoose.model<IClient>("Client", clientSchema);
