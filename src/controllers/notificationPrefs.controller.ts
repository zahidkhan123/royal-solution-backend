import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { ValidatedRequest } from "../middleware/validateBody.middleware.js";
import {
  getOrCreatePrefs,
  updatePrefs,
} from "../services/notificationPreference.service.js";

export const getNotificationPrefsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const doc = await getOrCreatePrefs(String(req.user!._id));
    res.status(200).json({
      success: true,
      data: {
        pushEnabled: doc.pushEnabled,
        emailEnabled: doc.emailEnabled,
        preferredTimezone: doc.preferredTimezone ?? null,
        pushTokens: doc.pushTokens ?? [],
      },
    });
  } catch (e) {
    next(e);
  }
};

export const putNotificationPrefsHandler = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const patch = req.validatedBody as Record<string, unknown>;
    const doc = await updatePrefs(String((req as AuthRequest).user!._id), {
      pushEnabled: patch.pushEnabled as boolean | undefined,
      emailEnabled: patch.emailEnabled as boolean | undefined,
      preferredTimezone: (patch.preferredTimezone as string) || undefined,
      pushTokens: patch.pushTokens as string[] | undefined,
    });
    res.status(200).json({
      success: true,
      data: {
        pushEnabled: doc.pushEnabled,
        emailEnabled: doc.emailEnabled,
        preferredTimezone: doc.preferredTimezone ?? null,
        pushTokens: doc.pushTokens ?? [],
      },
    });
  } catch (e) {
    next(e);
  }
};
