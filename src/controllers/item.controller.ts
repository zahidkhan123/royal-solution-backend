import { Response, NextFunction } from "express";
import Item from "../models/Item.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isStaffRole, isOwnedBy } from "../constants/maintenance.js";

export const listItems = async (
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
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50)
    );
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filter: Record<string, unknown> = {
      isActive: true,
      createdBy: req.user!._id,
    };
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { description: re }];
    }

    const [total, items] = await Promise.all([
      Item.countDocuments(filter),
      Item.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { items },
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

export const getItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const item = await Item.findById(req.params.id).lean();
    if (!item || item.isActive === false) {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }
    if (!isOwnedBy(item.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { item },
    });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const { name, description, price, unit, tax, defaultDiscount, images } =
      req.body;
    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Item name is required" });
      return;
    }

    let imageList: string[] = [];
    if (Array.isArray(images)) {
      imageList = images
        .map((u) => String(u || "").trim())
        .filter(Boolean);
    }

    const item = await Item.create({
      createdBy: req.user!._id,
      name: name.trim(),
      description,
      price: Number(price) || 0,
      unit: unit || "unit",
      tax: Number(tax) || 0,
      defaultDiscount: Number(defaultDiscount) || 0,
      images: imageList,
    });

    res.status(201).json({
      success: true,
      message: "Item saved",
      data: { item },
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const item = await Item.findById(req.params.id);
    if (!item || !item.isActive) {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }
    if (!isOwnedBy(item.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const fields = [
      "name",
      "description",
      "price",
      "unit",
      "tax",
      "defaultDiscount",
    ] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (item as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }
    if (req.body.images !== undefined) {
      if (!Array.isArray(req.body.images)) {
        res
          .status(400)
          .json({ success: false, message: "images must be an array of URLs" });
        return;
      }
      item.images = req.body.images
        .map((u: unknown) => String(u || "").trim())
        .filter(Boolean);
    }

    await item.save();
    res.status(200).json({
      success: true,
      message: "Item updated",
      data: { item },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }
    const item = await Item.findById(req.params.id);
    if (!item || !item.isActive) {
      res.status(404).json({ success: false, message: "Item not found" });
      return;
    }
    if (!isOwnedBy(item.createdBy, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }
    item.isActive = false;
    await item.save();
    res.status(200).json({ success: true, message: "Item deleted" });
  } catch (error) {
    next(error);
  }
};
