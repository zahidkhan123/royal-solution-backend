import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User.model.js";
import Job from "../models/Job.model.js";
import Property from "../models/Property.model.js";
import Project from "../models/Project.model.js";
import WeeklyReport from "../models/WeeklyReport.model.js";
import Invoice from "../models/Invoice.model.js";
import Quote from "../models/Quote.model.js";
import Client from "../models/Client.model.js";
import Item from "../models/Item.model.js";
import BankAccount from "../models/BankAccount.model.js";
import CompanySettings from "../models/CompanySettings.model.js";
import AppNotification from "../models/AppNotification.model.js";
import NotificationPreference from "../models/NotificationPreference.model.js";
import OTP from "../models/OTP.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

function sanitizeUserResponse(user: IUser) {
  return {
    id: user._id,
    fullName: user.fullName ?? null,
    phone: user.phone ?? null,
    whatsapp: user.whatsapp ?? null,
    email: user.email,
    country: user.country ?? null,
    state: user.state ?? null,
    city: user.city ?? null,
    area: user.area ?? null,
    dob: user.dob ?? null,
    gender: user.gender ?? null,
    role: user.role ?? [],
    isVerified: Boolean(user.isVerified),
    isProfileCompleted: Boolean(user.isProfileCompleted ?? false),
    profileImage: user.profileImage ?? null,
    bio: user.bio ?? null,
    blockedUsers: (user.blockedUsers ?? []).map((id) => id.toString()),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const getUserProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user!._id).select("-password");
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const user = await User.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    if (typeof body.fullName === "string") user.fullName = body.fullName || null;
    if (typeof body.gender === "string")
      user.gender = (body.gender as IUser["gender"]) || null;
    if (body.dob !== undefined) user.dob = (body.dob as Date) || null;
    if (typeof body.city === "string") user.city = body.city || null;
    if (typeof body.state === "string") user.state = body.state || null;
    if (typeof body.area === "string") user.area = body.area || null;
    if (typeof body.country === "string") user.country = body.country || null;
    if (typeof body.phone === "string") user.phone = body.phone || null;
    if (typeof body.whatsapp === "string") user.whatsapp = body.whatsapp || null;
    if (typeof body.bio === "string") user.bio = body.bio || undefined;
    if (typeof body.profileImage === "string")
      user.profileImage = body.profileImage || undefined;
    if (typeof body.username === "string")
      user.username = body.username || null;

    await user.save();
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { user: sanitizeUserResponse(user) },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUserAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const owned = { owner: userId };
    const created = { createdBy: userId };

    await Promise.all([
      Job.deleteMany(owned),
      Property.deleteMany(owned),
      Project.deleteMany(owned),
      WeeklyReport.deleteMany(owned),
      Invoice.deleteMany(created),
      Quote.deleteMany(created),
      Client.deleteMany(created),
      Item.deleteMany(created),
      BankAccount.deleteMany(created),
      CompanySettings.deleteMany(created),
      AppNotification.deleteMany({ user: userId }),
      NotificationPreference.deleteMany({ userId }),
      OTP.deleteMany({ email: user.email }),
      User.updateMany(
        { blockedUsers: userId },
        { $pull: { blockedUsers: userId } }
      ),
    ]);

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, message: "Valid userId required" });
      return;
    }
    if (String(userId) === String(req.user!._id)) {
      res.status(400).json({ success: false, message: "Cannot block yourself" });
      return;
    }
    await User.findByIdAndUpdate(req.user!._id, {
      $addToSet: { blockedUsers: userId },
    });
    res.status(200).json({ success: true, message: "User blocked" });
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, message: "Valid userId required" });
      return;
    }
    await User.findByIdAndUpdate(req.user!._id, {
      $pull: { blockedUsers: userId },
    });
    res.status(200).json({ success: true, message: "User unblocked" });
  } catch (error) {
    next(error);
  }
};
