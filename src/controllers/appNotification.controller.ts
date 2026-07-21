import { Response, NextFunction } from "express";
import AppNotification from "../models/AppNotification.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const listNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit || "30"), 10) || 30)
    );

    const filter = { user: req.user!._id };
    const [total, notifications, unreadCount] = await Promise.all([
      AppNotification.countDocuments(filter),
      AppNotification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AppNotification.countDocuments({ ...filter, isRead: false }),
    ]);

    res.status(200).json({
      success: true,
      data: { notifications, unreadCount },
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

export const markNotificationRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const n = await AppNotification.findOne({
      _id: req.params.id,
      user: req.user!._id,
    });
    if (!n) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    n.isRead = true;
    n.readAt = new Date();
    await n.save();
    res.status(200).json({ success: true, data: { notification: n } });
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await AppNotification.updateMany(
      { user: req.user!._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.status(200).json({ success: true, message: "All marked as read" });
  } catch (error) {
    next(error);
  }
};
