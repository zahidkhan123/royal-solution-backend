import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isStaffRole } from "../constants/maintenance.js";

/**
 * App-user directory. Contacts in this product are per-account clients
 * (`/clients`), so this does not expose other signed-in users.
 */
export const listContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Staff only" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "30"), 10) || 30)
    );
    res.status(200).json({
      success: true,
      data: { contacts: [] },
      pagination: {
        page,
        limit,
        total: 0,
        pages: 1,
      },
    });
  } catch (error) {
    next(error);
  }
};
