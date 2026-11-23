import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcrypt";

/**
 * User roles enum
 * - User: property owner / tenant (client)
 * - Contractor: tradesperson / maintenance provider
 * - Admin: back-office
 */
export enum UserRole {
  USER = "User",
  CONTRACTOR = "Contractor",
  ADMIN = "Admin",
}

/**
 * Gender enum
 */
export enum Gender {
  MALE = "Male",
  FEMALE = "Female",
  OTHER = "Other",
}

/**
 * Auth provider enum
 */
export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
  FACEBOOK = "facebook",
  APPLE = "apple",
}

/**
 * User interface
 */
export interface IUser extends Document {
  fullName: string | null;
  username?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email: string;
  password?: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  area?: string | null;
  dob?: Date | null;
  role: UserRole[];
  gender?: Gender | null;
  isProfileCompleted: boolean;
  profileImage?: string;
  bio?: string;
  isVerified: boolean;
  verificationRequestedAt?: Date;
  verifiedAt?: Date;
  provider: AuthProvider;
  socialId?: string;
  mutedUntil?: Date;
  suspendedAt?: Date;
  blockedUsers: mongoose.Types.ObjectId[];
  acceptedTermsAt?: Date;
  /** Generic notification toggles + push token storage helpers on user doc */
  notificationPreferences?: {
    pushEnabled: boolean;
    emailEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * User schema
 */
const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      trim: true,
      default: null,
      minlength: [2, "Full name must be at least 2 characters"],
      maxlength: [50, "Full name cannot exceed 50 characters"],
    },
    username: {
      type: String,
      trim: true,
      sparse: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
      validate: {
        validator: function (this: IUser, password: string) {
          if (this.provider === AuthProvider.LOCAL && !password) {
            return false;
          }
          return true;
        },
        message: "Password is required for local authentication",
      },
    },
    country: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    dob: {
      type: Date,
    },
    whatsapp: {
      type: String,
      trim: true,
    },
    role: {
      type: [String],
      enum: Object.values(UserRole),
      default: [],
    },
    gender: {
      type: String,
      enum: Object.values(Gender),
    },
    provider: {
      type: String,
      enum: Object.values(AuthProvider),
      default: AuthProvider.LOCAL,
      required: true,
    },
    socialId: {
      type: String,
      sparse: true,
    },
    profileImage: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isProfileCompleted: {
      type: Boolean,
      default: false,
    },
    verificationRequestedAt: {
      type: Date,
    },
    verifiedAt: {
      type: Date,
    },
    mutedUntil: { type: Date },
    suspendedAt: { type: Date },
    blockedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    acceptedTermsAt: {
      type: Date,
    },
    notificationPreferences: {
      pushEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ country: 1, state: 1, city: 1 });
userSchema.index({ provider: 1, socialId: 1 });
userSchema.index({ blockedUsers: 1 });

/**
 * Drop role values that are no longer in the UserRole enum (e.g. legacy
 * "Manager" / "Owner" left on older accounts). Without this, any save() on
 * such a user — like a profile update — fails enum validation on `role.N`.
 */
const VALID_ROLES = new Set<string>(Object.values(UserRole));
userSchema.pre("validate", function (next) {
  const roles = this.role as unknown;
  if (Array.isArray(roles) && roles.some((r) => !VALID_ROLES.has(String(r)))) {
    this.role = [
      ...new Set(roles.map(String).filter((r) => VALID_ROLES.has(r))),
    ] as UserRole[];
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.provider !== AuthProvider.LOCAL) {
    return next();
  }

  if (!this.password) {
    return next(new Error("Password is required for local authentication"));
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;
