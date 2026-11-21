import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import Quote from "../models/Quote.model.js";
import Invoice, {
  calcInvoiceTotals,
  calcLineTotal,
  type IInvoiceLineItem,
} from "../models/Invoice.model.js";
import Client from "../models/Client.model.js";
import Item from "../models/Item.model.js";
import Job from "../models/Job.model.js";
import Property from "../models/Property.model.js";
import CompanySettings, {
  toCompanySnapshot,
} from "../models/CompanySettings.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  INVOICE_TEMPLATE_IDS,
  QUOTE_STATUSES,
  isStaffRole,
  isOwnedBy,
  type InvoiceTemplateId,
  type QuoteStatus,
} from "../constants/maintenance.js";
import { createNotification } from "../services/appNotification.service.js";
import { resolveProjectAssignment } from "../utils/projectLink.js";

const OPEN_QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent"];
const TERMINAL_QUOTE_STATUSES: QuoteStatus[] = [
  "accepted",
  "declined",
  "expired",
  "converted",
];

function resolveTemplateId(raw: unknown, fallback: string): InvoiceTemplateId {
  const id = typeof raw === "string" ? raw : fallback;
  if (INVOICE_TEMPLATE_IDS.includes(id as InvoiceTemplateId)) {
    return id as InvoiceTemplateId;
  }
  return "classic";
}

function dateStamp(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function nextQuoteNumber(): Promise<string> {
  const prefix = dateStamp();
  const last = await Quote.findOne({
    quoteNumber: new RegExp(`^${prefix}`),
  })
    .sort({ quoteNumber: -1 })
    .select("quoteNumber")
    .lean();

  if (!last?.quoteNumber) return prefix;

  const extra = last.quoteNumber.slice(prefix.length);
  const n = extra ? parseInt(extra, 10) : 1;
  const next = Number.isNaN(n) ? 2 : n + 1;
  return next <= 1 ? prefix : `${prefix}${String(next).padStart(2, "0")}`;
}

async function nextInvoiceNumber(): Promise<string> {
  const prefix = dateStamp();
  const last = await Invoice.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  if (!last?.invoiceNumber) return prefix;

  const extra = last.invoiceNumber.slice(prefix.length);
  const n = extra ? parseInt(extra, 10) : 1;
  const next = Number.isNaN(n) ? 2 : n + 1;
  return next <= 1 ? prefix : `${prefix}${String(next).padStart(2, "0")}`;
}

function parseImageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

async function normalizeItems(items: unknown[]): Promise<IInvoiceLineItem[]> {
  if (!Array.isArray(items)) return [];

  const parsed = items.map((raw) => {
    const r = raw as Record<string, unknown>;
    const quantity = Number(r.quantity) || 1;
    const price = Number(r.price) || 0;
    const discount = Number(r.discount) || 0;
    const tax = Number(r.tax) || 0;
    const images = parseImageList(r.images);
    const line: IInvoiceLineItem = {
      item: r.item as IInvoiceLineItem["item"],
      name: String(r.name || "Item"),
      description: r.description ? String(r.description) : undefined,
      quantity,
      unit: String(r.unit || "unit"),
      price,
      discount,
      tax,
      total: 0,
      images: images.length ? images : undefined,
    };
    line.total = calcLineTotal(line);
    return line;
  });

  const needLookup = parsed
    .filter((l) => (!l.images || l.images.length === 0) && l.item)
    .map((l) => String(l.item));
  if (needLookup.length) {
    const catalog = await Item.find({ _id: { $in: needLookup } })
      .select("images")
      .lean();
    const byId = new Map(
      catalog.map((it) => [String(it._id), parseImageList(it.images)])
    );
    for (const line of parsed) {
      if (line.images?.length || !line.item) continue;
      const imgs = byId.get(String(line.item));
      if (imgs?.length) line.images = imgs;
    }
  }

  return parsed;
}

const quotePopulate = [
  { path: "client", select: "name email phone contactPerson billingAddress" },
  { path: "job", select: "title priority status" },
  { path: "property", select: "name address city owner" },
  { path: "billToUser", select: "fullName email phone" },
  { path: "createdBy", select: "fullName email phone" },
  { path: "invoice", select: "invoiceNumber status grandTotal" },
] as const;

async function expireOverdueQuotes(): Promise<void> {
  const now = new Date();
  await Quote.updateMany(
    {
      status: "sent",
      validUntil: { $lt: now },
    },
    { $set: { status: "expired" } }
  );
}

async function userCanAccessQuote(
  user: NonNullable<AuthRequest["user"]>,
  quote: {
    createdBy?: { _id?: unknown } | unknown;
    billToUser?: { _id?: unknown } | unknown;
    property?: { _id?: unknown; owner?: unknown } | unknown;
  }
): Promise<boolean> {
  if (isOwnedBy(quote.createdBy, user)) return true;

  const userId = String(user._id);
  const billTo = quote.billToUser as { _id?: unknown } | string | undefined;
  const billToId =
    billTo && typeof billTo === "object" && "_id" in billTo
      ? String(billTo._id)
      : billTo
        ? String(billTo)
        : "";
  if (billToId && billToId === userId) return true;

  const prop = quote.property as
    | { _id?: unknown; owner?: { _id?: unknown } | unknown }
    | string
    | undefined;
  if (!prop) return false;

  if (typeof prop === "object" && prop.owner != null) {
    const owner =
      typeof prop.owner === "object" && prop.owner && "_id" in prop.owner
        ? String((prop.owner as { _id: unknown })._id)
        : String(prop.owner);
    if (owner === userId) return true;
  }

  const propertyId =
    typeof prop === "object" && prop._id != null
      ? String(prop._id)
      : String(prop);
  if (!propertyId || propertyId === "undefined") return false;

  const owned = await Property.findOne({
    _id: propertyId,
    owner: user._id,
    isActive: true,
  })
    .select("_id")
    .lean();
  return Boolean(owned);
}

export const listQuotes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const jobId =
      typeof req.query.job === "string" ? req.query.job.trim() : "";
    const projectId =
      typeof req.query.project === "string" ? req.query.project.trim() : "";

    await expireOverdueQuotes();

    const filter: Record<string, unknown> = { createdBy: user._id };
    if (status) filter.status = status;

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const matchingClients = await Client.find({
        name: re,
        createdBy: user._id,
      })
        .select("_id")
        .lean();
      const searchOr: Record<string, unknown>[] = [
        { quoteNumber: re },
        { referenceNumber: re },
      ];
      if (matchingClients.length) {
        searchOr.push({
          client: { $in: matchingClients.map((c) => c._id) },
        });
      }
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }
    if (jobId) filter.job = jobId;
    if (projectId) filter.project = projectId;

    const [total, quotes] = await Promise.all([
      Quote.countDocuments(filter),
      Quote.find(filter)
        .populate("client", "name email phone")
        .populate("job", "title priority status")
        .populate("property", "name address")
        .populate("invoice", "invoiceNumber status")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { quotes },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await expireOverdueQuotes();
    const quote = await Quote.findById(req.params.id)
      .populate(quotePopulate as unknown as string)
      .lean();

    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }

    const allowed = await userCanAccessQuote(req.user!, quote);
    if (!allowed) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    res.status(200).json({ success: true, data: { quote } });
  } catch (error) {
    next(error);
  }
};

export const createQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const {
      clientId,
      jobId,
      propertyId,
      billToUser,
      quoteNumber,
      issueDate,
      validUntil,
      dueDate,
      referenceNumber,
      items,
      discountType,
      discountValue,
      shippingCost,
      currency,
      language,
      attachments,
      notes,
      status,
      saveAsDraft,
      templateId: bodyTemplateId,
      projectId,
    } = req.body;

    if (!clientId) {
      res.status(400).json({ success: false, message: "Client is required" });
      return;
    }

    const client = await Client.findById(clientId);
    if (!client || !client.isActive) {
      res.status(404).json({ success: false, message: "Client not found" });
      return;
    }

    const lineItems = await normalizeItems(items || []);
    const totals = calcInvoiceTotals({
      items: lineItems,
      discountType: discountType || "fixed",
      discountValue: Number(discountValue) || 0,
      shippingCost: Number(shippingCost) || 0,
    });

    let linkedBillToUser = billToUser || client.user;
    let linkedProperty = propertyId;
    let linkedProject: unknown;
    if (projectId) {
      const link = await resolveProjectAssignment({
        user: req.user!,
        projectId,
        propertyId: propertyId || undefined,
      });
      if (!link.ok) {
        res.status(link.status).json({ success: false, message: link.message });
        return;
      }
      if (!link.cleared && link.projectId) {
        linkedProject = link.projectId;
        linkedProperty = linkedProperty || link.propertyId;
      }
    }
    if (jobId) {
      const job = await Job.findById(jobId);
      if (job) {
        linkedBillToUser = linkedBillToUser || job.owner;
        linkedProperty = linkedProperty || job.property;
      }
    }

    const companySettings = await CompanySettings.findOne({
      createdBy: req.user!._id,
    }).lean();
    const templateId = resolveTemplateId(
      bodyTemplateId,
      companySettings?.defaultTemplateId || "classic"
    );
    const companySnapshot = toCompanySnapshot(companySettings || undefined);

    const number = quoteNumber?.trim() || (await nextQuoteNumber());
    const quoteStatus: QuoteStatus =
      saveAsDraft === true || status === "draft"
        ? "draft"
        : QUOTE_STATUSES.includes(status as QuoteStatus)
          ? (status as QuoteStatus)
          : "sent";

    const validUntilRaw = validUntil || dueDate;
    const quote = await Quote.create({
      createdBy: req.user!._id,
      client: clientId,
      billToUser: linkedBillToUser,
      job: jobId,
      property: linkedProperty,
      project: linkedProject,
      quoteNumber: number,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
      referenceNumber,
      status: quoteStatus,
      items: lineItems,
      discountType: discountType || "fixed",
      discountValue: Number(discountValue) || 0,
      shippingCost: Number(shippingCost) || 0,
      currency: currency || "GBP",
      language: language || "en",
      ...totals,
      attachments: Array.isArray(attachments) ? attachments : [],
      notes,
      templateId,
      companySnapshot,
    });

    if (quoteStatus === "sent" && linkedBillToUser) {
      await createNotification({
        userId: linkedBillToUser,
        type: "quote_sent",
        title: "Quote received",
        body: `Quote ${number} · ${totals.grandTotal} ${currency || "GBP"}`,
        data: { quoteId: String(quote._id), quoteNumber: number },
      });
    }

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(201).json({
      success: true,
      message: quoteStatus === "draft" ? "Draft saved" : "Quote created",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const updateQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }
    if (!isOwnedBy(quote.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (TERMINAL_QUOTE_STATUSES.includes(quote.status)) {
      res.status(400).json({
        success: false,
        message: `Cannot edit a ${quote.status} quote`,
      });
      return;
    }

    if (req.body.items) {
      quote.items = await normalizeItems(req.body.items);
    }
    if (req.body.discountType !== undefined)
      quote.discountType = req.body.discountType;
    if (req.body.discountValue !== undefined)
      quote.discountValue = Number(req.body.discountValue) || 0;
    if (req.body.shippingCost !== undefined)
      quote.shippingCost = Number(req.body.shippingCost) || 0;
    if (req.body.currency !== undefined) quote.currency = req.body.currency;
    if (req.body.language !== undefined) quote.language = req.body.language;
    if (req.body.validUntil !== undefined || req.body.dueDate !== undefined) {
      const raw = req.body.validUntil ?? req.body.dueDate;
      quote.validUntil = raw ? new Date(raw) : undefined;
    }
    if (req.body.issueDate !== undefined)
      quote.issueDate = new Date(req.body.issueDate);
    if (req.body.referenceNumber !== undefined)
      quote.referenceNumber = req.body.referenceNumber;
    if (req.body.notes !== undefined) quote.notes = req.body.notes;
    if (req.body.attachments !== undefined)
      quote.attachments = req.body.attachments;
    if (req.body.clientId !== undefined) quote.client = req.body.clientId;
    if (req.body.projectId !== undefined) {
      const link = await resolveProjectAssignment({
        user: req.user!,
        projectId: req.body.projectId,
        propertyId: quote.property,
      });
      if (!link.ok) {
        res.status(link.status).json({ success: false, message: link.message });
        return;
      }
      quote.set("project", link.cleared ? null : link.projectId);
      if (!link.cleared && !quote.property && link.propertyId) {
        quote.property = link.propertyId;
      }
    }
    if (req.body.templateId !== undefined) {
      quote.templateId = resolveTemplateId(req.body.templateId, "classic");
    }
    if (quote.status === "draft" || req.body.refreshCompanySnapshot === true) {
      const companySettings = await CompanySettings.findOne({
        createdBy: req.user!._id,
      }).lean();
      const snap = toCompanySnapshot(companySettings || undefined);
      if (snap) quote.companySnapshot = snap as typeof quote.companySnapshot;
      if (!req.body.templateId && companySettings?.defaultTemplateId) {
        quote.templateId = resolveTemplateId(
          companySettings.defaultTemplateId,
          quote.templateId || "classic"
        );
      }
    }

    const totals = calcInvoiceTotals({
      items: quote.items,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      shippingCost: quote.shippingCost,
    });
    quote.subtotal = totals.subtotal;
    quote.discountAmount = totals.discountAmount;
    quote.taxAmount = totals.taxAmount;
    quote.grandTotal = totals.grandTotal;

    if (req.body.status && OPEN_QUOTE_STATUSES.includes(req.body.status)) {
      const prev = quote.status;
      quote.status = req.body.status;
      if (prev === "draft" && req.body.status === "sent" && quote.billToUser) {
        await createNotification({
          userId: quote.billToUser,
          type: "quote_sent",
          title: "Quote received",
          body: `Quote ${quote.quoteNumber}`,
          data: { quoteId: String(quote._id) },
        });
      }
    }

    await quote.save();

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(200).json({
      success: true,
      message: "Quote updated",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const sendQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }
    if (!isOwnedBy(quote.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }
    if (quote.status !== "draft" && quote.status !== "sent") {
      res.status(400).json({
        success: false,
        message: `Cannot send a ${quote.status} quote`,
      });
      return;
    }

    const wasDraft = quote.status === "draft";
    quote.status = "sent";
    await quote.save();

    if (wasDraft && quote.billToUser) {
      await createNotification({
        userId: quote.billToUser,
        type: "quote_sent",
        title: "Quote received",
        body: `Quote ${quote.quoteNumber} · ${quote.grandTotal} ${quote.currency}`,
        data: { quoteId: String(quote._id), quoteNumber: quote.quoteNumber },
      });
    }

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(200).json({
      success: true,
      message: "Quote sent",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }

    const allowed = await userCanAccessQuote(req.user!, {
      createdBy: quote.createdBy,
      billToUser: quote.billToUser,
      property: quote.property,
    });
    if (!allowed) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (quote.status !== "sent") {
      res.status(400).json({
        success: false,
        message: "Only a sent quote can be accepted",
      });
      return;
    }

    quote.status = "accepted";
    quote.acceptedAt = new Date();
    quote.acceptedBy = req.user!._id as mongoose.Types.ObjectId;
    await quote.save();

    await createNotification({
      userId: quote.createdBy,
      type: "quote_accepted",
      title: "Quote accepted",
      body: `${quote.quoteNumber} was accepted`,
      data: { quoteId: String(quote._id) },
    });

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(200).json({
      success: true,
      message: "Quote accepted",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const declineQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }

    const allowed = await userCanAccessQuote(req.user!, {
      createdBy: quote.createdBy,
      billToUser: quote.billToUser,
      property: quote.property,
    });
    if (!allowed) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (quote.status !== "sent") {
      res.status(400).json({
        success: false,
        message: "Only a sent quote can be declined",
      });
      return;
    }

    quote.status = "declined";
    quote.declinedAt = new Date();
    await quote.save();

    await createNotification({
      userId: quote.createdBy,
      type: "quote_declined",
      title: "Quote declined",
      body: `${quote.quoteNumber} was declined`,
      data: { quoteId: String(quote._id) },
    });

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(200).json({
      success: true,
      message: "Quote declined",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const convertQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }
    if (!isOwnedBy(quote.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (quote.status === "converted" || quote.invoice) {
      res.status(400).json({
        success: false,
        message: "Quote already converted",
      });
      return;
    }
    if (quote.status === "declined" || quote.status === "expired") {
      res.status(400).json({
        success: false,
        message: `Cannot convert a ${quote.status} quote`,
      });
      return;
    }
    if (!["draft", "sent", "accepted"].includes(quote.status)) {
      res.status(400).json({
        success: false,
        message: "This quote cannot be converted to an invoice",
      });
      return;
    }

    if (quote.status === "draft" || quote.status === "sent") {
      quote.status = "accepted";
      quote.acceptedAt = quote.acceptedAt || new Date();
      quote.acceptedBy =
        quote.acceptedBy || (req.user!._id as mongoose.Types.ObjectId);
    }

    const invoiceNumber = await nextInvoiceNumber();
    const invoice = await Invoice.create({
      createdBy: quote.createdBy,
      client: quote.client,
      billToUser: quote.billToUser,
      job: quote.job,
      property: quote.property,
      project: quote.project,
      quote: quote._id,
      invoiceNumber,
      issueDate: new Date(),
      dueDate: quote.validUntil,
      items: quote.items,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      shippingCost: quote.shippingCost,
      currency: quote.currency,
      language: quote.language,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      taxAmount: quote.taxAmount,
      grandTotal: quote.grandTotal,
      depositPaid: 0,
      amountDue: quote.grandTotal,
      attachments: quote.attachments,
      notes: quote.notes,
      templateId: quote.templateId,
      companySnapshot: quote.companySnapshot,
      status: "sent",
    });

    quote.status = "converted";
    quote.invoice = invoice._id as mongoose.Types.ObjectId;
    quote.convertedAt = new Date();
    await quote.save();

    if (quote.job) {
      const job = await Job.findById(quote.job);
      if (job && !job.invoice) {
        job.invoice = invoice._id as mongoose.Types.ObjectId;
        await job.save();
      }
    }

    if (quote.billToUser) {
      await createNotification({
        userId: quote.billToUser,
        type: "invoice_generated",
        title: "Invoice generated",
        body: `Invoice ${invoiceNumber} from quote ${quote.quoteNumber}`,
        data: {
          invoiceId: String(invoice._id),
          invoiceNumber,
          quoteId: String(quote._id),
        },
      });
    }

    const populatedQuote = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate("client")
      .populate("bankAccount")
      .populate("job", "title")
      .lean();

    res.status(201).json({
      success: true,
      message: "Quote converted to invoice",
      data: { quote: populatedQuote, invoice: populatedInvoice },
    });
  } catch (error) {
    next(error);
  }
};

export const duplicateQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const source = await Quote.findById(req.params.id);
    if (!source) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }
    if (!isOwnedBy(source.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const quote = await Quote.create({
      createdBy: req.user!._id,
      client: source.client,
      billToUser: source.billToUser,
      job: source.job,
      property: source.property,
      quoteNumber: await nextQuoteNumber(),
      issueDate: new Date(),
      validUntil,
      referenceNumber: source.referenceNumber,
      status: "draft",
      items: JSON.parse(JSON.stringify(source.items || [])),
      discountType: source.discountType,
      discountValue: source.discountValue,
      shippingCost: source.shippingCost,
      currency: source.currency,
      language: source.language,
      subtotal: source.subtotal,
      discountAmount: source.discountAmount,
      taxAmount: source.taxAmount,
      grandTotal: source.grandTotal,
      attachments: source.attachments,
      notes: source.notes,
      templateId: source.templateId,
      companySnapshot: source.companySnapshot,
    });

    const populated = await Quote.findById(quote._id)
      .populate(quotePopulate as unknown as string)
      .lean();

    res.status(201).json({
      success: true,
      message: "Quote duplicated",
      data: { quote: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteQuote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: "Quote not found" });
      return;
    }
    if (!isOwnedBy(quote.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (quote.status === "converted" || quote.invoice) {
      res.status(400).json({
        success: false,
        message: "Cannot delete a converted quote. Open the invoice instead.",
      });
      return;
    }

    await quote.deleteOne();

    res.status(200).json({
      success: true,
      message: "Quote deleted",
    });
  } catch (error) {
    next(error);
  }
};
