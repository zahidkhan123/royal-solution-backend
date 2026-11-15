import mongoose, { Document, Schema } from "mongoose";
import {
  CURRENCIES,
  INVOICE_LANGUAGES,
  INVOICE_TEMPLATE_IDS,
  QUOTE_STATUSES,
  type InvoiceTemplateId,
  type QuoteStatus,
} from "../constants/maintenance.js";
import type { IInvoiceLineItem } from "./Invoice.model.js";

export type IQuoteLineItem = IInvoiceLineItem;

export interface IQuote extends Document {
  createdBy: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  billToUser?: mongoose.Types.ObjectId;
  job?: mongoose.Types.ObjectId;
  property?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId | null;
  quoteNumber: string;
  issueDate: Date;
  validUntil?: Date;
  referenceNumber?: string;
  status: QuoteStatus;
  items: IQuoteLineItem[];
  discountType?: "percentage" | "fixed";
  discountValue: number;
  shippingCost: number;
  currency: string;
  language: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  attachments: {
    name: string;
    url: string;
    type?: string;
    description?: string;
  }[];
  notes?: {
    paymentTerms?: string;
    additionalNotes?: string;
    warranty?: string;
    internalNotes?: string;
  };
  templateId: InvoiceTemplateId;
  companySnapshot?: {
    companyName?: string;
    logoUrl?: string;
    tagline?: string;
    email?: string;
    phone?: string;
    cell?: string;
    website?: string;
    businessId?: string;
    taxRegistrationNo?: string;
    vatNumber?: string;
    address?: {
      street?: string;
      apartment?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
    accentColor?: string;
    invoiceFooter?: string;
  };
  /** Invoice created when this quote was converted */
  invoice?: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  acceptedBy?: mongoose.Types.ObjectId;
  declinedAt?: Date;
  convertedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IQuoteLineItem>(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item" },
    name: { type: String, required: true },
    description: String,
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: "unit" },
    price: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    images: [{ type: String }],
  },
  { _id: false }
);

const quoteSchema = new Schema<IQuote>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    billToUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    quoteNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    issueDate: { type: Date, default: Date.now },
    validUntil: { type: Date },
    referenceNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: QUOTE_STATUSES,
      default: "draft",
      index: true,
    },
    items: [lineItemSchema],
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "fixed",
    },
    discountValue: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "GBP",
    },
    language: {
      type: String,
      enum: INVOICE_LANGUAGES,
      default: "en",
    },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    attachments: [
      {
        name: String,
        url: String,
        type: String,
        description: String,
      },
    ],
    notes: {
      paymentTerms: String,
      additionalNotes: String,
      warranty: String,
      internalNotes: String,
    },
    templateId: {
      type: String,
      enum: INVOICE_TEMPLATE_IDS,
      default: "classic",
    },
    companySnapshot: {
      companyName: String,
      logoUrl: String,
      tagline: String,
      email: String,
      phone: String,
      cell: String,
      website: String,
      businessId: String,
      taxRegistrationNo: String,
      vatNumber: String,
      address: {
        street: String,
        apartment: String,
        city: String,
        postalCode: String,
        country: String,
      },
      accentColor: String,
      invoiceFooter: String,
    },
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User" },
    declinedAt: { type: Date },
    convertedAt: { type: Date },
  },
  { timestamps: true }
);

quoteSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
quoteSchema.index({ billToUser: 1, status: 1 });
quoteSchema.index({ job: 1, createdAt: -1 });

export default mongoose.model<IQuote>("Quote", quoteSchema);
