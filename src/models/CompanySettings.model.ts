import mongoose, { Document, Schema } from "mongoose";
import {
  INVOICE_TEMPLATE_IDS,
  type InvoiceTemplateId,
} from "../constants/maintenance.js";

export interface ICompanyAddress {
  street?: string;
  apartment?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface ICompanySettings extends Document {
  createdBy: mongoose.Types.ObjectId;
  companyName: string;
  logoUrl?: string;
  tagline?: string;
  email?: string;
  phone?: string;
  cell?: string;
  website?: string;
  businessId?: string;
  taxRegistrationNo?: string;
  vatNumber?: string;
  address?: ICompanyAddress;
  defaultTemplateId: InvoiceTemplateId;
  accentColor?: string;
  invoiceFooter?: string;
  defaultPaymentTerms?: string;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<ICompanyAddress>(
  {
    street: String,
    apartment: String,
    city: String,
    postalCode: String,
    country: String,
  },
  { _id: false }
);

const companySettingsSchema = new Schema<ICompanySettings>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      maxlength: 160,
    },
    logoUrl: { type: String, trim: true },
    tagline: { type: String, trim: true, maxlength: 200 },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    cell: { type: String, trim: true },
    website: { type: String, trim: true },
    businessId: { type: String, trim: true },
    taxRegistrationNo: { type: String, trim: true },
    vatNumber: { type: String, trim: true },
    address: addressSchema,
    defaultTemplateId: {
      type: String,
      enum: INVOICE_TEMPLATE_IDS,
      default: "classic",
    },
    accentColor: { type: String, trim: true, default: "#E85D4C" },
    invoiceFooter: { type: String, trim: true, maxlength: 500 },
    defaultPaymentTerms: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export function toCompanySnapshot(
  settings: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!settings) return undefined;
  const address = settings.address as ICompanyAddress | undefined;
  return {
    companyName: (settings.companyName as string) || "",
    logoUrl: settings.logoUrl as string | undefined,
    tagline: settings.tagline as string | undefined,
    email: settings.email as string | undefined,
    phone: settings.phone as string | undefined,
    cell: settings.cell as string | undefined,
    website: settings.website as string | undefined,
    businessId: settings.businessId as string | undefined,
    taxRegistrationNo: settings.taxRegistrationNo as string | undefined,
    vatNumber: settings.vatNumber as string | undefined,
    address: address
      ? {
          street: address.street,
          apartment: address.apartment,
          city: address.city,
          postalCode: address.postalCode,
          country: address.country,
        }
      : undefined,
    accentColor: settings.accentColor as string | undefined,
    invoiceFooter: settings.invoiceFooter as string | undefined,
  };
}

export default mongoose.model<ICompanySettings>(
  "CompanySettings",
  companySettingsSchema
);
