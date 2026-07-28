import User, { AuthProvider, UserRole, type IUser } from "../models/User.model.js";
import { generateToken } from "../utils/jwt.js";

/**
 * Single-user / local mode.
 *
 * When SINGLE_USER_MODE=true (or 1/yes), the API bootstraps one full-access
 * account and clients can obtain a session without login or signup.
 *
 * Intended for personal / demo installs — do not enable on multi-tenant prod.
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isSingleUserMode(): boolean {
  const raw = String(process.env.SINGLE_USER_MODE || "")
    .trim()
    .toLowerCase();
  return TRUTHY.has(raw);
}

export function singleUserEmail(): string {
  return (
    String(process.env.SINGLE_USER_EMAIL || "local@single.user")
      .trim()
      .toLowerCase() || "local@single.user"
  );
}

export function singleUserName(): string {
  return (
    String(process.env.SINGLE_USER_NAME || "Local User").trim() || "Local User"
  );
}

/** Full ops power: Admin + Contractor + User (properties + jobs + invoices). */
const SINGLE_USER_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.CONTRACTOR,
  UserRole.USER,
];

let cachedUserId: string | null = null;

export function sanitizeSingleUser(user: IUser) {
  return {
    id: user._id,
    fullName: user.fullName ?? singleUserName(),
    phone: user.phone ?? null,
    whatsapp: user.whatsapp ?? null,
    email: user.email,
    country: user.country ?? null,
    state: user.state ?? null,
    city: user.city ?? null,
    area: user.area ?? null,
    dob: user.dob ?? null,
    gender: user.gender ?? null,
    role: user.role ?? SINGLE_USER_ROLES,
    accountType: "single_user",
    isVerified: true,
    isProfileCompleted: true,
    isSingleUser: true,
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

/**
 * Ensure the local full-access user exists (idempotent).
 * Called on server boot and when minting a session.
 */
export async function ensureSingleUser(): Promise<IUser> {
  const email = singleUserEmail();

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      fullName: singleUserName(),
      password: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: SINGLE_USER_ROLES,
      provider: AuthProvider.LOCAL,
      isVerified: true,
      isProfileCompleted: true,
      acceptedTermsAt: new Date(),
      notificationPreferences: {
        pushEnabled: true,
        emailEnabled: true,
      },
    });
    console.log(`[single-user] Created local account ${email}`);
  } else {
    let dirty = false;
    const roles = Array.isArray(user.role) ? [...user.role] : [];
    for (const r of SINGLE_USER_ROLES) {
      if (!roles.includes(r)) {
        roles.push(r);
        dirty = true;
      }
    }
    if (dirty) {
      user.role = roles as UserRole[];
    }
    if (!user.isVerified) {
      user.isVerified = true;
      dirty = true;
    }
    if (!user.isProfileCompleted) {
      user.isProfileCompleted = true;
      dirty = true;
    }
    if (!user.fullName) {
      user.fullName = singleUserName();
      dirty = true;
    }
    if (dirty) {
      await user.save();
      console.log(`[single-user] Updated local account ${email}`);
    }
  }

  cachedUserId = String(user._id);
  return user;
}

export async function getSingleUserDocument(): Promise<IUser | null> {
  if (!isSingleUserMode()) return null;

  if (cachedUserId) {
    const byId = await User.findById(cachedUserId).select("-password");
    if (byId) return byId;
    cachedUserId = null;
  }

  const user = await ensureSingleUser();
  return User.findById(user._id).select("-password");
}

/** Mint JWT + public user payload for clients (no credentials). */
export async function mintSingleUserSession(): Promise<{
  token: string;
  user: ReturnType<typeof sanitizeSingleUser>;
}> {
  const user = await ensureSingleUser();
  const token = generateToken(String(user._id));
  return {
    token,
    user: sanitizeSingleUser(user),
  };
}
