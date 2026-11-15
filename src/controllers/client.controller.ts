import { Response, NextFunction } from "express";
import Client from "../models/Client.model.js";
import Property from "../models/Property.model.js";
import User from "../models/User.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isClientUserRole, isStaffRole, isOwnedBy } from "../constants/maintenance.js";

async function resolveLinkedUser(
  userId: unknown
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (userId === null || userId === "" || userId === undefined) {
    return { ok: true, id: "" };
  }
  const id = String(userId);
  const user = await User.findById(id).select("role fullName email phone").lean();
  if (!user) {
    return { ok: false, message: "Linked contact not found" };
  }
  const roles = Array.isArray(user.role) ? user.role : user.role ? [user.role] : [];
  const lower = roles.map((r) => String(r).toLowerCase());
  const isOwner =
    roles.length === 0 ||
    lower.some((r) => r === "user" || r === "client") ||
    isClientUserRole(user.role as string | string[]);
  const staffOnly =
    roles.length > 0 &&
    lower.every((r) => r === "admin" || r === "contractor") &&
    !isOwner;
  if (staffOnly) {
    return { ok: false, message: "Cannot link staff account as client contact" };
  }
  return { ok: true, id };
}

export const listClients = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filter: Record<string, unknown> = {
      isActive: true,
      createdBy: req.user!._id,
    };
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { name: re },
        { email: re },
        { contactPerson: re },
        { phone: re },
      ];
    }

    const [total, clients] = await Promise.all([
      Client.countDocuments(filter),
      Client.find(filter)
        .populate("user", "fullName email phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { clients },
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

export const getClient = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }
    const client = await Client.findById(req.params.id)
      .populate("user", "fullName email phone")
      .lean();
    if (!client || !client.isActive) {
      res.status(404).json({ success: false, message: "Client not found" });
      return;
    }
    if (!isOwnedBy(client.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const properties = await Property.find({
      client: client._id,
      owner: req.user!._id,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      data: { client, properties },
    });
  } catch (error) {
    next(error);
  }
};

export const createClient = async (
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
      name,
      email,
      billingAddress,
      taxRegistrationNo,
      vatNumber,
      contactPerson,
      phone,
      fax,
      cell,
      website,
      user,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Client name is required" });
      return;
    }

    const linked = await resolveLinkedUser(user);
    if (!linked.ok) {
      res.status(400).json({ success: false, message: linked.message });
      return;
    }

    const client = await Client.create({
      createdBy: req.user!._id,
      name: name.trim(),
      email,
      billingAddress,
      taxRegistrationNo,
      vatNumber,
      contactPerson,
      phone,
      fax,
      cell,
      website,
      user: linked.id || undefined,
    });

    res.status(201).json({
      success: true,
      message: "Client added",
      data: { client },
    });
  } catch (error) {
    next(error);
  }
};

export const updateClient = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const client = await Client.findById(req.params.id);
    if (!client || !client.isActive) {
      res.status(404).json({ success: false, message: "Client not found" });
      return;
    }
    if (!isOwnedBy(client.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const fields = [
      "name",
      "email",
      "billingAddress",
      "taxRegistrationNo",
      "vatNumber",
      "contactPerson",
      "phone",
      "fax",
      "cell",
      "website",
    ] as const;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (client as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }

    if (req.body.user !== undefined) {
      const linked = await resolveLinkedUser(req.body.user);
      if (!linked.ok) {
        res.status(400).json({ success: false, message: linked.message });
        return;
      }
      client.user = linked.id
        ? (linked.id as unknown as typeof client.user)
        : undefined;
    }

    await client.save();
    res.status(200).json({
      success: true,
      message: "Client updated",
      data: { client },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteClient = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }
    const client = await Client.findById(req.params.id);
    if (!client || !client.isActive) {
      res.status(404).json({ success: false, message: "Client not found" });
      return;
    }
    if (!isOwnedBy(client.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }
    client.isActive = false;
    await client.save();
    res.status(200).json({ success: true, message: "Client deleted" });
  } catch (error) {
    next(error);
  }
};
