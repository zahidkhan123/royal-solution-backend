import { Response, NextFunction } from "express";
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
  isStaffRole,
  type InvoiceTemplateId,
} from "../constants/maintenance.js";
import {
  createNotification,
} from "../services/appNotification.service.js";

function resolveTemplateId(raw: unknown, fallback: string): InvoiceTemplateId {
  const id = typeof raw === "string" ? raw : fallback;
  if (INVOICE_TEMPLATE_IDS.includes(id as InvoiceTemplateId)) {
    return id as InvoiceTemplateId;
  }
  return "classic";
}

async function nextInvoiceNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${year}-${month}-`;
  const last = await Invoice.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  let seq = 1;
  if (last?.invoiceNumber) {
    const part = last.invoiceNumber.split("-").pop();
    const n = parseInt(part || "0", 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function parseImageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Normalize line items and snapshot catalog images onto each line
 * (so invoices keep photos even if the library item changes later).
 */
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

  // Backfill images from catalog when client didn't send them
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

export const listInvoices = async (
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

    const filter: Record<string, unknown> = {};
    if (!isStaffRole(user.role)) {
      // Property owners: invoices billed to them OR linked to their properties
      const ownedProps = await Property.find({
        owner: user._id,
        isActive: true,
      })
        .select("_id")
        .lean();
      const propertyIds = ownedProps.map((p) => p._id);
      filter.$or = [
        { billToUser: user._id },
        ...(propertyIds.length ? [{ property: { $in: propertyIds } }] : []),
      ];
      // Users don't see pure drafts unless sent/pending/paid/etc.
      filter.status = status || { $ne: "draft" };
    } else {
      if (status) filter.status = status;
    }

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.invoiceNumber = re;
    }

    // Mark overdue
    const now = new Date();
    await Invoice.updateMany(
      {
        status: { $in: ["sent", "pending"] },
        dueDate: { $lt: now },
      },
      { $set: { status: "overdue" } }
    );

    const [total, invoices] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter)
        .populate("client", "name email phone")
        .populate("job", "title priority status")
        .populate("property", "name address")
        .populate("bankAccount")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { invoices },
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

async function userCanAccessInvoice(
  user: NonNullable<AuthRequest["user"]>,
  invoice: {
    billToUser?: { _id?: unknown } | unknown;
    property?: { _id?: unknown; owner?: unknown } | unknown;
  }
): Promise<boolean> {
  if (isStaffRole(user.role)) return true;

  const userId = String(user._id);
  const billTo = invoice.billToUser as { _id?: unknown } | string | undefined;
  const billToId =
    billTo && typeof billTo === "object" && "_id" in billTo
      ? String(billTo._id)
      : billTo
        ? String(billTo)
        : "";
  if (billToId && billToId === userId) return true;

  // Property owners may open invoices linked to their property
  const prop = invoice.property as
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

export const getInvoice = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("client")
      .populate("job", "title priority status")
      .populate("property", "name address city owner")
      .populate("bankAccount")
      .populate("billToUser", "fullName email phone")
      .populate("createdBy", "fullName email phone")
      .lean();

    if (!invoice) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    const user = req.user!;
    const allowed = await userCanAccessInvoice(user, invoice);
    if (!allowed) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    res.status(200).json({ success: true, data: { invoice } });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const {
      clientId,
      jobId,
      propertyId,
      billToUser,
      invoiceNumber,
      issueDate,
      dueDate,
      referenceNumber,
      orderNumber,
      items,
      discountType,
      discountValue,
      paymentMethod,
      shippingCost,
      currency,
      language,
      bankAccountId,
      depositRequest,
      attachments,
      notes,
      status,
      saveAsDraft,
      templateId: bodyTemplateId,
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

    let deposit;
    if (depositRequest && depositRequest.value != null) {
      const dtype = depositRequest.type === "percentage" ? "percentage" : "fixed";
      const dval = Number(depositRequest.value) || 0;
      const amount =
        dtype === "percentage"
          ? Math.round(totals.grandTotal * (dval / 100) * 100) / 100
          : dval;
      deposit = {
        type: dtype as "percentage" | "fixed",
        value: dval,
        amount,
        dueDate: depositRequest.dueDate
          ? new Date(depositRequest.dueDate)
          : undefined,
        cancelled: false,
      };
    }

    let linkedBillToUser = billToUser || client.user;
    let linkedProperty = propertyId;
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

    const number = invoiceNumber?.trim() || (await nextInvoiceNumber());
    const invStatus =
      saveAsDraft === true || status === "draft"
        ? "draft"
        : status || "sent";

    const invoice = await Invoice.create({
      createdBy: req.user!._id,
      client: clientId,
      billToUser: linkedBillToUser,
      job: jobId,
      property: linkedProperty,
      invoiceNumber: number,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      referenceNumber,
      orderNumber,
      status: invStatus,
      items: lineItems,
      discountType: discountType || "fixed",
      discountValue: Number(discountValue) || 0,
      paymentMethod,
      shippingCost: Number(shippingCost) || 0,
      currency: currency || "GBP",
      language: language || "en",
      ...totals,
      bankAccount: bankAccountId,
      depositRequest: deposit,
      attachments: Array.isArray(attachments) ? attachments : [],
      notes,
      templateId,
      companySnapshot,
    });

    if (jobId) {
      await Job.findByIdAndUpdate(jobId, { invoice: invoice._id });
    }

    if (invStatus !== "draft" && linkedBillToUser) {
      await createNotification({
        userId: linkedBillToUser,
        type: "invoice_generated",
        title: "Invoice generated",
        body: `Invoice ${number} · ${totals.grandTotal} ${currency || "GBP"}`,
        data: { invoiceId: String(invoice._id), invoiceNumber: number },
      });
      if (deposit && !deposit.cancelled) {
        await createNotification({
          userId: linkedBillToUser,
          type: "deposit_requested",
          title: "Deposit requested",
          body: `Deposit of ${deposit.amount} ${currency || "GBP"} requested`,
          data: { invoiceId: String(invoice._id) },
        });
      }
    }

    const populated = await Invoice.findById(invoice._id)
      .populate("client")
      .populate("bankAccount")
      .populate("job", "title")
      .lean();

    res.status(201).json({
      success: true,
      message: invStatus === "draft" ? "Draft saved" : "Invoice created",
      data: { invoice: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    if (req.body.items) {
      invoice.items = await normalizeItems(req.body.items);
    }
    if (req.body.discountType !== undefined)
      invoice.discountType = req.body.discountType;
    if (req.body.discountValue !== undefined)
      invoice.discountValue = Number(req.body.discountValue) || 0;
    if (req.body.shippingCost !== undefined)
      invoice.shippingCost = Number(req.body.shippingCost) || 0;
    if (req.body.paymentMethod !== undefined)
      invoice.paymentMethod = req.body.paymentMethod;
    if (req.body.currency !== undefined) invoice.currency = req.body.currency;
    if (req.body.language !== undefined) invoice.language = req.body.language;
    if (req.body.dueDate !== undefined)
      invoice.dueDate = req.body.dueDate
        ? new Date(req.body.dueDate)
        : undefined;
    if (req.body.issueDate !== undefined)
      invoice.issueDate = new Date(req.body.issueDate);
    if (req.body.referenceNumber !== undefined)
      invoice.referenceNumber = req.body.referenceNumber;
    if (req.body.orderNumber !== undefined)
      invoice.orderNumber = req.body.orderNumber;
    if (req.body.bankAccountId !== undefined)
      invoice.bankAccount = req.body.bankAccountId;
    if (req.body.notes !== undefined) invoice.notes = req.body.notes;
    if (req.body.attachments !== undefined)
      invoice.attachments = req.body.attachments;
    if (req.body.clientId !== undefined) invoice.client = req.body.clientId;
    if (req.body.templateId !== undefined) {
      invoice.templateId = resolveTemplateId(req.body.templateId, "classic");
    }
    // Refresh branding snapshot while draft if company profile changed
    if (invoice.status === "draft" || req.body.refreshCompanySnapshot === true) {
      const companySettings = await CompanySettings.findOne({
        createdBy: req.user!._id,
      }).lean();
      const snap = toCompanySnapshot(companySettings || undefined);
      if (snap) invoice.companySnapshot = snap as typeof invoice.companySnapshot;
      if (!req.body.templateId && companySettings?.defaultTemplateId) {
        invoice.templateId = resolveTemplateId(
          companySettings.defaultTemplateId,
          invoice.templateId || "classic"
        );
      }
    }

    const totals = calcInvoiceTotals({
      items: invoice.items,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      shippingCost: invoice.shippingCost,
    });
    invoice.subtotal = totals.subtotal;
    invoice.discountAmount = totals.discountAmount;
    invoice.taxAmount = totals.taxAmount;
    invoice.grandTotal = totals.grandTotal;

    if (req.body.status) {
      const prev = invoice.status;
      invoice.status = req.body.status;
      if (req.body.status === "paid" && prev !== "paid") {
        invoice.paidAt = new Date();
        if (invoice.billToUser) {
          await createNotification({
            userId: invoice.billToUser,
            type: "payment_received",
            title: "Payment received",
            body: `Payment confirmed for ${invoice.invoiceNumber}`,
            data: { invoiceId: String(invoice._id) },
          });
        }
      }
      if (
        prev === "draft" &&
        req.body.status !== "draft" &&
        invoice.billToUser
      ) {
        await createNotification({
          userId: invoice.billToUser,
          type: "invoice_generated",
          title: "Invoice generated",
          body: `Invoice ${invoice.invoiceNumber}`,
          data: { invoiceId: String(invoice._id) },
        });
      }
    }

    if (req.body.depositRequest?.cancelled) {
      if (invoice.depositRequest) {
        invoice.depositRequest.cancelled = true;
      }
    }

    await invoice.save();

    const populated = await Invoice.findById(invoice._id)
      .populate("client")
      .populate("bankAccount")
      .lean();

    res.status(200).json({
      success: true,
      message: "Invoice updated",
      data: { invoice: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const markInvoicePaid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    const user = req.user!;
    const allowed = await userCanAccessInvoice(user, {
      billToUser: invoice.billToUser,
      property: invoice.property,
    });
    if (!allowed) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    invoice.status = "paid";
    invoice.paidAt = new Date();
    await invoice.save();

    // Notify admin who created invoice
    await createNotification({
      userId: invoice.createdBy,
      type: "payment_received",
      title: "Payment completed",
      body: `${invoice.invoiceNumber} marked as paid`,
      data: { invoiceId: String(invoice._id) },
    });

    res.status(200).json({
      success: true,
      message: "Payment completed",
      data: { invoice },
    });
  } catch (error) {
    next(error);
  }
};
