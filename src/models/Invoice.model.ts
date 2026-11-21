import mongoose, { Document, Schema } from "mongoose";
import {
  CURRENCIES,
  INVOICE_LANGUAGES,
  INVOICE_STATUSES,
  INVOICE_TEMPLATE_IDS,
  PAYMENT_METHODS,
  type InvoiceStatus,
  type InvoiceTemplateId,
} from "../constants/maintenance.js";

export interface IInvoiceLineItem {
  item?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  price: number;
  discount: number;
  tax: number;
  total: number;
  /** Deposit the client already paid against this line. Reduces amount due, not the total. */
  deposit?: number;
  /** Snapshot of catalog item images at invoice time (optional) */
  images?: string[];
}

/** Money received after the invoice was issued (deposit or part/final payment). */
export interface IInvoicePayment {
  _id?: mongoose.Types.ObjectId;
  amount: number;
  type: "deposit" | "paid";
  date: Date;
  recordedBy?: mongoose.Types.ObjectId;
}

export interface IInvoice extends Document {
  createdBy: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  /** Property owner (user) who should see this invoice */
  billToUser?: mongoose.Types.ObjectId;
  job?: mongoose.Types.ObjectId;
  property?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId | null;
  /** Source quote when this invoice was converted from one */
  quote?: mongoose.Types.ObjectId;
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  orderNumber?: string;
  status: InvoiceStatus;
  items: IInvoiceLineItem[];
  discountType?: "percentage" | "fixed";
  discountValue: number;
  paymentMethod?: string;
  shippingCost: number;
  currency: string;
  language: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  /** Sum of line deposits already paid by the client. */
  depositPaid: number;
  /** Payments recorded on the invoice screen. */
  payments: IInvoicePayment[];
  /** Sum of payments. */
  amountPaid: number;
  /** grandTotal − depositPaid − amountPaid. */
  amountDue: number;
  bankAccount?: mongoose.Types.ObjectId;
  depositRequest?: {
    type: "percentage" | "fixed";
    value: number;
    amount: number;
    dueDate?: Date;
    cancelled: boolean;
  };
  attachments: {
    name: string;
    url: string;
    type?: string;
    /** Caption shown next to the attachment image on the PDF */
    description?: string;
  }[];
  notes?: {
    paymentTerms?: string;
    additionalNotes?: string;
    warranty?: string;
    internalNotes?: string;
  };
  /** Visual template id (stripe, classic, serif, …) */
  templateId: InvoiceTemplateId;
  /** Branding frozen at issue time */
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
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IInvoiceLineItem>(
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
    deposit: { type: Number, default: 0, min: 0 },
    images: [{ type: String }],
  },
  { _id: false }
);

const paymentSchema = new Schema<IInvoicePayment>({
  amount: { type: Number, required: true, min: 0.01 },
  type: { type: String, enum: ["deposit", "paid"], default: "paid" },
  date: { type: Date, default: Date.now },
  recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
});

const invoiceSchema = new Schema<IInvoice>(
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
    quote: {
      type: Schema.Types.ObjectId,
      ref: "Quote",
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    referenceNumber: { type: String, trim: true },
    orderNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
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
    paymentMethod: {
      type: String,
      enum: [...PAYMENT_METHODS, null],
    },
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
    depositPaid: { type: Number, default: 0 },
    payments: { type: [paymentSchema], default: [] },
    amountPaid: { type: Number, default: 0 },
    // No default: older invoices without it fall back to grandTotal in clients.
    amountDue: { type: Number },
    bankAccount: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
    },
    depositRequest: {
      type: {
        type: String,
        enum: ["percentage", "fixed"],
      },
      value: Number,
      amount: Number,
      dueDate: Date,
      cancelled: { type: Boolean, default: false },
    },
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
    paidAt: { type: Date },
  },
  { timestamps: true }
);

invoiceSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ billToUser: 1, status: 1 });

export function calcLineTotal(line: {
  quantity: number;
  price: number;
  discount?: number;
  tax?: number;
}): number {
  const base = line.quantity * line.price;
  const afterDiscount = Math.max(0, base - (line.discount || 0));
  const tax = afterDiscount * ((line.tax || 0) / 100);
  return Math.round((afterDiscount + tax) * 100) / 100;
}

export function calcInvoiceTotals(inv: {
  items: IInvoiceLineItem[];
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  shippingCost?: number;
  payments?: { amount: number }[];
}): {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  depositPaid: number;
  amountPaid: number;
  amountDue: number;
} {
  let subtotal = 0;
  let depositPaid = 0;
  let taxAmount = 0;
  for (const line of inv.items || []) {
    const base = line.quantity * line.price;
    const afterLineDiscount = Math.max(0, base - (line.discount || 0));
    subtotal += afterLineDiscount;
    taxAmount += afterLineDiscount * ((line.tax || 0) / 100);
    depositPaid += Math.max(0, line.deposit || 0);
  }
  depositPaid = Math.round(depositPaid * 100) / 100;
  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;

  let discountAmount = 0;
  const dv = inv.discountValue || 0;
  if (inv.discountType === "percentage") {
    discountAmount = Math.round(subtotal * (dv / 100) * 100) / 100;
  } else {
    discountAmount = Math.min(subtotal, dv);
  }

  const shipping = inv.shippingCost || 0;
  const grandTotal =
    Math.round((subtotal - discountAmount + taxAmount + shipping) * 100) / 100;

  const amountPaid =
    Math.round(
      (inv.payments || []).reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0) * 100
    ) / 100;

  // Deposits and payments are money already received: they lower what's owed, not the total.
  const amountDue = Math.max(
    0,
    Math.round((grandTotal - depositPaid - amountPaid) * 100) / 100
  );

  return {
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal,
    depositPaid,
    amountPaid,
    amountDue,
  };
}

export default mongoose.model<IInvoice>("Invoice", invoiceSchema);
