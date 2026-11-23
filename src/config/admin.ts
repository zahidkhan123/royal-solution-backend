import type { AuthRequest } from "../middleware/auth.middleware.js";

/**
 * Portal admins: accounts that may see every user's jobs, estimates and
 * invoices — but only when browsing from the admin portal.
 *
 * Decided by email (ADMIN_EMAILS, comma separated), NOT by the `Admin` role:
 * every app sign-up is currently granted Admin/Contractor/User, so the role
 * alone cannot tell the business owner apart from regular customers.
 */
const DEFAULT_ADMIN_EMAILS = "royalsolution@gmail.com";

export function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? DEFAULT_ADMIN_EMAILS;
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isPortalAdmin(user: AuthRequest["user"]): boolean {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && adminEmails().has(email));
}

/** Header the admin portal sends on every API request. */
export const ADMIN_PORTAL_CLIENT = "admin-portal";

/**
 * True when the request comes from the admin portal AND the signed-in account
 * is a portal admin. The mobile app never sends the header, so admins still
 * see only their own records there.
 */
export function canSeeAllRecords(req: AuthRequest): boolean {
  const client = String(req.get("x-client") || "").trim().toLowerCase();
  return client === ADMIN_PORTAL_CLIENT && isPortalAdmin(req.user);
}
