import { Response, NextFunction } from "express";
import User, { UserRole } from "../models/User.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  isAdminRole,
  isContractorRole,
  isStaffRole,
} from "../constants/maintenance.js";

/**
 * List property-owner contacts for client linking (staff only).
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
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filter: Record<string, unknown> = {
      $or: [{ suspendedAt: { $exists: false } }, { suspendedAt: null }],
    };

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$and = [
        {
          $or: [
            { fullName: re },
            { email: re },
            { phone: re },
            { username: re },
          ],
        },
      ];
    }

    // Fetch a wider window then filter property owners in-process
    // (role is a multi-value enum array; pure Mongo filters get brittle)
    const fetchLimit = Math.min(500, page * limit + 100);
    const users = await User.find(filter)
      .select("fullName email phone city country role")
      .sort({ fullName: 1, createdAt: -1 })
      .limit(fetchLimit)
      .lean();

    const ownerContacts = users.filter((u) => {
      const roles = Array.isArray(u.role) ? u.role : u.role ? [u.role] : [];
      // Exclude pure staff
      if (isAdminRole(roles as string[]) || isContractorRole(roles as string[])) {
        const lower = roles.map((r) => String(r).toLowerCase());
        const alsoOwner = lower.some((r) => r === "user" || r === "client");
        if (!alsoOwner) return false;
      }
      // Prefer explicit User role, or empty roles (legacy)
      if (roles.length === 0) return true;
      const lower = roles.map((r) => String(r).toLowerCase());
      return (
        lower.includes("user") ||
        lower.includes("client") ||
        lower.includes(UserRole.USER.toLowerCase())
      );
    });

    const total = ownerContacts.length;
    const start = (page - 1) * limit;
    const contacts = ownerContacts.slice(start, start + limit).map((u) => ({
      _id: u._id,
      fullName: u.fullName || "",
      email: u.email || "",
      phone: u.phone || "",
      city: u.city || "",
      country: u.country || "",
    }));

    res.status(200).json({
      success: true,
      data: { contacts },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit) || 1),
      },
    });
  } catch (error) {
    next(error);
  }
};
