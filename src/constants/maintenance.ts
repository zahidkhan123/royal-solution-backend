/** Shared domain constants for Property Maintenance app */

export const JOB_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const PRIORITY_RANK: Record<JobPriority, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

export const JOB_STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "pest_control",
  "landscaping",
  "cleaning",
  "security",
  "other",
] as const;

export const PROPERTY_TYPES = [
  "apartment",
  "house",
  "condo",
  "office",
  "retail",
  "warehouse",
  "mixed_use",
  "other",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "pending",
  "paid",
  "cancelled",
  "overdue",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "cheque",
  "online",
] as const;

export const CURRENCIES = ["GBP", "USD", "PKR", "EUR"] as const;

export const INVOICE_LANGUAGES = ["en", "ar", "fr"] as const;

/** Visual invoice layout ids (code-backed templates, not DB rows) */
export const INVOICE_TEMPLATE_IDS = [
  "stripe",
  "classic",
  "serif",
  "modern",
  "simple",
  "professional",
  "minimal",
] as const;
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number];

export const INVOICE_TEMPLATE_META: {
  id: InvoiceTemplateId;
  label: string;
  description: string;
}[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Soft-blue table, refined letterhead",
  },
  {
    id: "stripe",
    label: "Stripe",
    description: "Bold accent header with amount due",
  },
  {
    id: "serif",
    label: "Serif",
    description: "Warm editorial letterhead",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Large type, dark table",
  },
  {
    id: "simple",
    label: "Simple",
    description: "Compact one-page layout",
  },
  {
    id: "professional",
    label: "Professional",
    description: "Dark sidebar, branded accent",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Quiet print-first layout",
  },
];

/**
 * Parse Todoist-style quick entry: "Kitchen Sink Leakage p1"
 * Returns cleaned title + priority (default P4).
 */
export function parseJobQuickEntry(raw: string): {
  title: string;
  priority: JobPriority;
} {
  const text = (raw || "").trim();
  if (!text) {
    return { title: "", priority: "P4" };
  }
  const match = text.match(/\b(p[1-4])\b/i);
  let priority: JobPriority = "P4";
  let title = text;
  if (match) {
    priority = match[1].toUpperCase() as JobPriority;
    title = text
      .replace(new RegExp(`\\b${match[1]}\\b`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return { title: title || text, priority };
}

export function isAdminRole(role: string | string[] | undefined | null): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  return roles.some((r) => String(r).toLowerCase() === "admin");
}

export function isContractorRole(
  role: string | string[] | undefined | null
): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  return roles.some((r) => String(r).toLowerCase() === "contractor");
}

/**
 * Staff = Admin or Contractor.
 * Can manage all jobs, invoices, clients, items, bank accounts (ops surface).
 */
export function isStaffRole(
  role: string | string[] | undefined | null
): boolean {
  return isAdminRole(role) || isContractorRole(role);
}

export function isClientUserRole(
  role: string | string[] | undefined | null
): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  // Explicit User, or empty roles treated as client for legacy accounts
  if (roles.length === 0) return true;
  return roles.some((r) => {
    const n = String(r).toLowerCase();
    return n === "user" || n === "client";
  });
}
