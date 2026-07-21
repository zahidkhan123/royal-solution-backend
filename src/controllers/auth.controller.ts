import { Response, NextFunction } from "express";
import User, { AuthProvider, UserRole } from "../models/User.model.js";
import OTP from "../models/OTP.model.js";
import { generateToken } from "../utils/jwt.js";
import { generateOTP, getOTPExpiry } from "../utils/otp.js";
import { sendOTPEmail } from "../utils/email.js";
import { ValidatedRequest } from "../middleware/validateBody.middleware.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { IUser } from "../models/User.model.js";

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
    notificationPreferences: {
      pushEnabled: user.notificationPreferences?.pushEnabled ?? true,
      emailEnabled: user.notificationPreferences?.emailEnabled ?? true,
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getDefaultNotificationPreferences() {
  return {
    pushEnabled: true,
    emailEnabled: true,
  };
}

/**
 * Map client account type → UserRole (never allow Admin via public register).
 */
function resolveSignupRole(
  accountType?: string,
  roleAlias?: string
): UserRole {
  const raw = String(accountType || roleAlias || "user")
    .trim()
    .toLowerCase();
  if (raw === "contractor") return UserRole.CONTRACTOR;
  return UserRole.USER;
}

/**
 * Register a new account.
 * POST /api/auth/register
 * Body: email, password, confirmPassword, accountType?: "user" | "contractor"
 */
export const register = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, acceptedTerms, accountType, role } =
      req.validatedBody! as {
        email: string;
        password: string;
        acceptedTerms?: boolean;
        accountType?: string;
        role?: string;
      };
    const emailNorm = (email as string).toLowerCase().trim();
    const assignedRole = resolveSignupRole(accountType, role);

    // Use exact match so DB index is used (schema has lowercase: true)
    const existingUser = await User.findOne({ email: emailNorm });
    if (existingUser) {
      const provider = existingUser.provider || AuthProvider.LOCAL;
      const providerLabel =
        provider === AuthProvider.GOOGLE
          ? "Google"
          : provider === AuthProvider.FACEBOOK
            ? "Facebook"
            : provider === AuthProvider.APPLE
              ? "Apple"
              : "email/password";

      res.status(409).json({
        success: false,
        message:
          provider === AuthProvider.LOCAL
            ? "An account with this email already exists. Please sign in or use Forgot password."
            : `This email is already registered with ${providerLabel}. Please continue with ${providerLabel} login.`,
      });
      return;
    }

    const fullNamePlaceholder =
      emailNorm.split("@")[0].slice(0, 50) || "User";

    const user = await User.create({
      fullName: fullNamePlaceholder,
      email: emailNorm,
      password,
      role: [assignedRole],
      isVerified: false,
      isProfileCompleted: false,
      acceptedTermsAt: acceptedTerms ? new Date() : undefined,
    });

    const otp = generateOTP();
    const expiresAt = getOTPExpiry();
    // Single DB op: upsert OTP (faster than deleteMany + create)
    await OTP.findOneAndUpdate(
      { email: emailNorm },
      { $set: { otp, expiresAt } },
      { upsert: true, new: true }
    );

    // Send OTP email in background so response is not delayed (no await)
    sendOTPEmail(emailNorm, otp).catch((emailErr: unknown) =>
      console.error("Failed to send registration OTP email:", emailErr)
    );

    const token = generateToken(String(user._id));
    const accountLabel =
      assignedRole === UserRole.CONTRACTOR ? "Contractor" : "User";

    res.status(201).json({
      success: true,
      message: `${accountLabel} registered successfully. OTP sent to email for verification.`,
      data: {
        user: sanitizeUserResponse(user),
        accountType:
          assignedRole === UserRole.CONTRACTOR ? "contractor" : "user",
        token,
        accessToken: token,
        refreshToken: token,
        otpInfo: { email: emailNorm, expiresIn: "5 minutes" },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.validatedBody!;
    const emailNorm = String(email).toLowerCase().trim();

    // Find user and include password field
    const user = await User.findOne({ email: emailNorm }).select("+password");

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    if (user.provider && user.provider !== AuthProvider.LOCAL) {
      const providerLabel =
        user.provider === AuthProvider.GOOGLE
          ? "Google"
          : user.provider === AuthProvider.FACEBOOK
            ? "Facebook"
            : user.provider === AuthProvider.APPLE
              ? "Apple"
              : "social";

      res.status(400).json({
        success: false,
        message: `This account uses ${providerLabel} login. Please sign in with ${providerLabel}.`,
      });
      return;
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    // Unverified accounts still need an OTP; create + email a fresh code on login.
    if (!user.isVerified) {
      const otp = generateOTP();
      const expiresAt = getOTPExpiry();
      await OTP.findOneAndUpdate(
        { email: emailNorm },
        { $set: { otp, expiresAt } },
        { upsert: true, new: true }
      );
      // Await so failures surface in logs before the response finishes; still
      // return login success so the client can open the OTP screen.
      try {
        await sendOTPEmail(emailNorm, otp);
      } catch (emailErr: unknown) {
        console.error("Failed to send login verification OTP email:", emailErr);
      }
    }

    const token = generateToken(String(user._id));
    res.status(200).json({
      success: true,
      message: user.isVerified
        ? "Login successful"
        : "Login successful. Please verify your email with the OTP sent to you.",
      data: {
        user: sanitizeUserResponse(user),
        token,
        accessToken: token,
        refreshToken: token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password - Generate and send OTP
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.validatedBody!;
    const emailNorm = (email as string).toLowerCase().trim();

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
      return;
    }

    if (user.provider && user.provider !== AuthProvider.LOCAL) {
      const providerLabel =
        user.provider === AuthProvider.GOOGLE
          ? "Google"
          : user.provider === AuthProvider.FACEBOOK
            ? "Facebook"
            : user.provider === AuthProvider.APPLE
              ? "Apple"
              : "social";

      res.status(400).json({
        success: false,
        message: `Password reset is not available for ${providerLabel} sign-in. Please continue with ${providerLabel}.`,
      });
      return;
    }

    const otp = generateOTP();
    const expiresAt = getOTPExpiry();
    await OTP.findOneAndUpdate(
      { email: emailNorm },
      { $set: { otp, expiresAt } },
      { upsert: true, new: true }
    );

    sendOTPEmail(emailNorm, otp).catch((emailErr: unknown) =>
      console.error("Failed to send forgot-password OTP email:", emailErr)
    );

    res.status(200).json({
      success: true,
      message: "OTP has been sent to your email",
      data: {
        email: emailNorm,
        expiresIn: "5 minutes",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
export const resendOTP = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.validatedBody!;
    const emailNorm = email.toLowerCase().trim();

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
      return;
    }

    const otp = generateOTP();
    const expiresAt = getOTPExpiry();
    await OTP.findOneAndUpdate(
      { email: emailNorm },
      { $set: { otp, expiresAt } },
      { upsert: true, new: true }
    );

    try {
      await sendOTPEmail(emailNorm, otp);
    } catch (emailErr: unknown) {
      console.error("Failed to send resend OTP email:", emailErr);
      res.status(502).json({
        success: false,
        message:
          "Could not send verification email. Please try again in a moment.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "OTP has been resent to your email",
      data: {
        email: emailNorm,
        expiresIn: "5 minutes",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify OTP - set user isVerified, delete OTP, return user + tokens
 * POST /api/auth/verify-otp
 */
export const verifyOTP = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, otp } = req.validatedBody!;
    const emailNorm = email.toLowerCase().trim();

    const otpRecord = await OTP.findOne({ email: emailNorm, otp });
    if (!otpRecord) {
      res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
      return;
    }

    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteOne({ _id: otpRecord._id });
      res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
      return;
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    await user.save();

    await OTP.deleteOne({ _id: otpRecord._id });

    const token = generateToken(String(user._id));
    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        user: sanitizeUserResponse(user),
        token,
        accessToken: token,
        refreshToken: token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password
 * POST /api/auth/reset-password
 */
export const resetPassword = async (
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.validatedBody!;
    const emailNorm = email.toLowerCase().trim();

    const otpRecord = await OTP.findOne({ email: emailNorm, otp });

    if (!otpRecord) {
      res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
      return;
    }

    // Check if OTP has expired
    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteOne({ _id: otpRecord._id });
      res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
      return;
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (user.provider && user.provider !== AuthProvider.LOCAL) {
      const providerLabel =
        user.provider === AuthProvider.GOOGLE
          ? "Google"
          : user.provider === AuthProvider.FACEBOOK
            ? "Facebook"
            : user.provider === AuthProvider.APPLE
              ? "Apple"
              : "social";

      res.status(400).json({
        success: false,
        message: `This account uses ${providerLabel} sign-in. Password reset is not required.`,
      });
      return;
    }

    user.password = newPassword;
    await user.save();

    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user profile (me)
 * GET /api/auth/profile
 */
export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user!._id).select("-password");
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
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

/**
 * Complete user profile (mandatory after OTP)
 * PUT /api/auth/profile
 */
export const completeProfile = async (
  req: AuthRequest & ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.validatedBody! as {
      fullName: string;
      username: string;
      gender: string;
      dob: Date;
      country: string;
      city: string;
      state: string;
      area?: string;
      phone: string;
      whatsapp?: string;
      profileImage?: string;
    };
    const user = await User.findById(req.user!._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }
    user.fullName = body.fullName;
    user.username = body.username;
    user.gender = body.gender as IUser["gender"];
    user.dob = body.dob;
    user.country = body.country;
    user.city = body.city;
    user.state = body.state;
    if (body.area !== undefined) user.area = body.area || null;
    user.phone = body.phone;
    if (body.whatsapp !== undefined) user.whatsapp = body.whatsapp || null;

    if (body.profileImage !== undefined)
      user.profileImage = body.profileImage || undefined;
    user.isProfileCompleted = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile completed successfully",
      data: {
        user: sanitizeUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile (partial update)
 * PATCH /api/auth/profile
 */
export const updateProfile = async (
  req: AuthRequest & ValidatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.validatedBody! as {
      fullName?: string;
      gender?: string;
      dob?: Date;
      city?: string;
      state?: string;
      area?: string;
      country?: string;
      phone?: string;
      whatsapp?: string;
      bio?: string;
      profileImage?: string;
    };
    const user = await User.findById(req.user!._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }
    if (body.fullName !== undefined) user.fullName = body.fullName || null;
    if (body.gender !== undefined)
      user.gender = (body.gender as IUser["gender"]) || null;
    if (body.dob !== undefined) user.dob = body.dob || null;
    if (body.city !== undefined) user.city = body.city || null;
    if (body.state !== undefined) user.state = body.state || null;
    if (body.area !== undefined) user.area = body.area || null;
    if (body.country !== undefined) user.country = body.country || null;
    if (body.phone !== undefined) user.phone = body.phone || null;
    if (body.whatsapp !== undefined) user.whatsapp = body.whatsapp || null;

    if (body.bio !== undefined) (user as any).bio = body.bio || undefined;
    if (body.profileImage !== undefined)
      user.profileImage = body.profileImage || undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: sanitizeUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile fields for profile settings screen.
 * PUT /api/auth/profile
 */
export const updateProfilePut = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fullName, phone, city, country } = req.body as {
      fullName?: string;
      phone?: string;
      city?: string;
      country?: string;
    };

    if (fullName !== undefined && String(fullName).trim().length < 2) {
      res.status(400).json({
        success: false,
        message: "Full name must be at least 2 characters long",
      });
      return;
    }

    const fields: Record<string, unknown> = {};
    if (fullName !== undefined) fields.fullName = String(fullName).trim();
    if (phone !== undefined) fields.phone = String(phone).trim();
    if (city !== undefined) fields.city = String(city).trim();
    if (country !== undefined) fields.country = String(country).trim();

    const updatedUser = await User.findByIdAndUpdate(
      req.user!._id,
      { $set: fields },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user: sanitizeUserResponse(updatedUser as IUser) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/notification-preferences
 */
export const getNotificationPreferences = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.user!._id).select(
      "notificationPreferences"
    );
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const defaults = getDefaultNotificationPreferences();
    const preferences = {
      ...defaults,
      ...(user.notificationPreferences || {}),
    };

    res.status(200).json({
      success: true,
      data: { preferences },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/notification-preferences
 */
export const putNotificationPreferences = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { pushEnabled, emailEnabled } = req.body as {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
    };

    const preferences = {
      pushEnabled:
        typeof pushEnabled === "boolean"
          ? pushEnabled
          : getDefaultNotificationPreferences().pushEnabled,
      emailEnabled:
        typeof emailEnabled === "boolean"
          ? emailEnabled
          : getDefaultNotificationPreferences().emailEnabled,
    };

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { $set: { notificationPreferences: preferences } },
      { new: true }
    ).select("notificationPreferences");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        preferences: {
          ...getDefaultNotificationPreferences(),
          ...(user.notificationPreferences || {}),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
