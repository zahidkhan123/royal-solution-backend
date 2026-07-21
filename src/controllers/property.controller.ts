import { Response, NextFunction } from "express";
import Property from "../models/Property.model.js";
import Job from "../models/Job.model.js";
import Invoice from "../models/Invoice.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { isStaffRole } from "../constants/maintenance.js";

export const listProperties = async (
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
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filter: Record<string, unknown> = { isActive: true };
    if (!isStaffRole(user.role)) {
      filter.owner = user._id;
    } else if (req.query.owner) {
      filter.owner = req.query.owner;
    }

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { address: re }, { city: re }];
    }

    const [total, properties] = await Promise.all([
      Property.countDocuments(filter),
      Property.find(filter)
        .populate("owner", "fullName email phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { properties },
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

export const getProperty = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const property = await Property.findById(req.params.id)
      .populate("owner", "fullName email phone")
      .lean();
    if (!property || !property.isActive) {
      res.status(404).json({ success: false, message: "Property not found" });
      return;
    }

    const user = req.user!;
    if (
      !isStaffRole(user.role) &&
      String(property.owner?._id || property.owner) !== String(user._id)
    ) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const [jobs, invoices] = await Promise.all([
      Job.find({ property: property._id })
        .sort({ priorityRank: 1, createdAt: -1 })
        .limit(50)
        .lean(),
      Invoice.find({
        $or: [
          { property: property._id },
          { billToUser: property.owner },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { property, jobs, invoices },
    });
  } catch (error) {
    next(error);
  }
};

export const createProperty = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name,
      type,
      address,
      country,
      city,
      postalCode,
      description,
      images,
    } = req.body;

    if (!name?.trim() || !address?.trim()) {
      res.status(400).json({
        success: false,
        message: "Name and address are required",
      });
      return;
    }

    const property = await Property.create({
      owner: req.user!._id,
      name: name.trim(),
      type: type || "apartment",
      address: address.trim(),
      country,
      city,
      postalCode,
      description,
      images: Array.isArray(images) ? images : [],
    });

    res.status(201).json({
      success: true,
      message: "Property added",
      data: { property },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProperty = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property || !property.isActive) {
      res.status(404).json({ success: false, message: "Property not found" });
      return;
    }

    if (
      !isStaffRole(req.user!.role) &&
      String(property.owner) !== String(req.user!._id)
    ) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const fields = [
      "name",
      "type",
      "address",
      "country",
      "city",
      "postalCode",
      "description",
      "images",
      "documents",
    ] as const;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (property as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }

    await property.save();
    res.status(200).json({
      success: true,
      message: "Property updated",
      data: { property },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProperty = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property || !property.isActive) {
      res.status(404).json({ success: false, message: "Property not found" });
      return;
    }

    if (
      !isStaffRole(req.user!.role) &&
      String(property.owner) !== String(req.user!._id)
    ) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    property.isActive = false;
    await property.save();

    res.status(200).json({ success: true, message: "Property deleted" });
  } catch (error) {
    next(error);
  }
};
