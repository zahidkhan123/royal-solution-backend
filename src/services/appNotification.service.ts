import mongoose from "mongoose";
import AppNotification, {
  type NotificationType,
} from "../models/AppNotification.model.js";

export async function createNotification(params: {
  userId: string | mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    return await AppNotification.create({
      user: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
    return null;
  }
}

/** Notify all staff (Admin + Contractor) users */
export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    const User = (await import("../models/User.model.js")).default;
    const staff = await User.find({
      role: { $in: ["Admin", "Contractor"] },
    })
      .select("_id")
      .lean();
    await Promise.all(
      staff.map((a) =>
        createNotification({
          userId: String(a._id),
          type: params.type,
          title: params.title,
          body: params.body,
          data: params.data,
        })
      )
    );
  } catch (err) {
    console.error("Failed to notify admins:", err);
  }
}
