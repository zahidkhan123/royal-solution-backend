import { Response, NextFunction } from "express";
import CompanySettings from "../models/CompanySettings.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  INVOICE_TEMPLATE_IDS,
  INVOICE_TEMPLATE_META,
  isStaffRole,
} from "../constants/maintenance.js";

const emptyDefaults = {
  companyName: "",
  logoUrl: "",
  tagline: "",
  email: "",
  phone: "",
  cell: "",
  website: "",
  businessId: "",
  taxRegistrationNo: "",
  vatNumber: "",
  address: {
    street: "",
    apartment: "",
    city: "",
    postalCode: "",
    country: "",
  },
  defaultTemplateId: "classic" as const,
  accentColor: "#E85D4C",
  invoiceFooter: "",
  defaultPaymentTerms: "Due on receipt",
};

export const getCompanySettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const settings = await CompanySettings.findOne({
      createdBy: req.user!._id,
    }).lean();

    res.status(200).json({
      success: true,
      data: {
        settings: settings || { ...emptyDefaults, createdBy: req.user!._id },
        templates: INVOICE_TEMPLATE_META,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const upsertCompanySettings = async (
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
      companyName,
      logoUrl,
      tagline,
      email,
      phone,
      cell,
      website,
      businessId,
      taxRegistrationNo,
      vatNumber,
      address,
      defaultTemplateId,
      accentColor,
      invoiceFooter,
      defaultPaymentTerms,
    } = req.body;

    if (!companyName?.trim()) {
      res
        .status(400)
        .json({ success: false, message: "Company name is required" });
      return;
    }

    let templateId = defaultTemplateId || "classic";
    if (
      templateId &&
      !INVOICE_TEMPLATE_IDS.includes(templateId as (typeof INVOICE_TEMPLATE_IDS)[number])
    ) {
      templateId = "classic";
    }

    const payload = {
      companyName: String(companyName).trim(),
      logoUrl: logoUrl ? String(logoUrl).trim() : undefined,
      tagline: tagline ? String(tagline).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      cell: cell ? String(cell).trim() : undefined,
      website: website ? String(website).trim() : undefined,
      businessId: businessId ? String(businessId).trim() : undefined,
      taxRegistrationNo: taxRegistrationNo
        ? String(taxRegistrationNo).trim()
        : undefined,
      vatNumber: vatNumber ? String(vatNumber).trim() : undefined,
      address: address
        ? {
            street: address.street || undefined,
            apartment: address.apartment || undefined,
            city: address.city || undefined,
            postalCode: address.postalCode || undefined,
            country: address.country || undefined,
          }
        : undefined,
      defaultTemplateId: templateId,
      accentColor: accentColor ? String(accentColor).trim() : "#E85D4C",
      invoiceFooter: invoiceFooter ? String(invoiceFooter).trim() : undefined,
      defaultPaymentTerms: defaultPaymentTerms
        ? String(defaultPaymentTerms).trim()
        : undefined,
    };

    const settings = await CompanySettings.findOneAndUpdate(
      { createdBy: req.user!._id },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(200).json({
      success: true,
      message: "Company settings saved",
      data: { settings },
    });
  } catch (error) {
    next(error);
  }
};

export const listInvoiceTemplates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }
    res.status(200).json({
      success: true,
      data: { templates: INVOICE_TEMPLATE_META },
    });
  } catch (error) {
    next(error);
  }
};
