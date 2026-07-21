import Joi from "joi";

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;

/**
 * Register validation: email, password, confirmPassword + account type.
 * accountType: "user" (client) | "contractor" — defaults to user.
 */
export const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  }),
  password: Joi.string().min(6).required().messages({
    "string.empty": "Password is required",
    "string.min": "Password must be at least 6 characters",
  }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "string.empty": "Please confirm your password",
  }),
  /** Preferred: "user" | "contractor" */
  accountType: Joi.string()
    .valid("user", "contractor", "User", "Contractor")
    .optional()
    .messages({
      "any.only": 'accountType must be "user" or "contractor"',
    }),
  /** Alias accepted from older clients */
  role: Joi.string()
    .valid("user", "contractor", "User", "Contractor")
    .optional(),
  acceptedTerms: Joi.boolean().optional(),
}).options({ stripUnknown: true, allowUnknown: true });

/**
 * Profile completion validation schema
 */
export const completeProfileSchema = Joi.object({
  fullName: Joi.string().min(2).max(50).required().messages({
    "string.empty": "Full name is required",
    "string.min": "Full name must be at least 2 characters",
    "string.max": "Full name cannot exceed 50 characters",
  }),
  username: Joi.string().min(3).max(30).required().messages({
    "string.empty": "Username is required",
    "string.min": "Username must be at least 3 characters",
    "string.max": "Username cannot exceed 30 characters",
  }),
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .required()
    .messages({
      "any.only": `Gender must be one of: ${GENDER_OPTIONS.join(", ")}`,
      "string.empty": "Gender is required",
    }),
  dob: Joi.date().required().messages({
    "date.base": "Date of birth is required",
    "any.required": "Date of birth is required",
  }),
  country: Joi.string().min(2).required().messages({
    "string.empty": "Country is required",
    "string.min": "Country must be at least 2 characters",
  }),
  city: Joi.string().min(2).required().messages({
    "string.empty": "City is required",
    "string.min": "City must be at least 2 characters",
  }),
  state: Joi.string().min(2).required().messages({
    "string.empty": "State is required",
    "string.min": "State must be at least 2 characters",
  }),
  area: Joi.string().allow("", null).optional(),
  phone: Joi.string().min(10).required().messages({
    "string.empty": "Phone number is required",
    "string.min": "Phone number must be at least 10 characters",
  }),
  whatsapp: Joi.string().min(10).optional().allow("", null).messages({
    "string.min": "WhatsApp number must be at least 10 characters",
  }),

  profileImage: Joi.string().uri().optional().allow("", null).messages({
    "string.uri": "Profile image must be a valid URL",
  }),
});

/**
 * Update profile validation schema (partial update - all fields optional)
 */
export const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(2).max(50).optional().allow("").messages({
    "string.min": "Full name must be at least 2 characters",
    "string.max": "Full name cannot exceed 50 characters",
  }),
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .optional()
    .allow("", null)
    .messages({
      "any.only": `Gender must be one of: ${GENDER_OPTIONS.join(", ")}`,
    }),
  dob: Joi.alternatives()
    .try(Joi.date(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .allow(null),
  city: Joi.string().min(2).optional().allow("").messages({
    "string.min": "City must be at least 2 characters",
  }),
  state: Joi.string().min(2).optional().allow("").messages({
    "string.min": "State must be at least 2 characters",
  }),
  area: Joi.string().allow("", null).optional(),
  country: Joi.string().min(2).optional().allow("", null).messages({
    "string.min": "Country must be at least 2 characters",
  }),
  phone: Joi.string().min(10).optional().allow("").messages({
    "string.min": "Phone number must be at least 10 characters",
  }),
  whatsapp: Joi.string().min(10).optional().allow("").messages({
    "string.min": "WhatsApp number must be at least 10 characters",
  }),

  bio: Joi.string().max(500).optional().allow("", null).messages({
    "string.max": "Bio cannot exceed 500 characters",
  }),
  profileImage: Joi.string().uri().optional().allow("", null).messages({
    "string.uri": "Profile image must be a valid URL",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update",
  })
  .options({ stripUnknown: true });

/**
 * Login validation schema
 */
export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
  }),
});

/**
 * Forgot password validation schema
 */
export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  }),
});

/**
 * Verify OTP validation schema
 */
export const verifyOTPSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  }),
  otp: Joi.string()
    .length(4)
    .pattern(/^[0-9]{4}$/)
    .required()
    .messages({
      "string.empty": "OTP is required",
      "string.length": "OTP must be 4 digits",
      "string.pattern.base": "OTP must contain only numbers",
    }),
  /** Meta App Events / CAPI dedupe id from mobile client */
  metaEventId: Joi.string().max(128).optional().allow("", null),
  /** Meta click id from deep link / install campaign */
  fbclid: Joi.string().max(512).optional().allow("", null),
  fbc: Joi.string().max(512).optional().allow("", null),
  fbp: Joi.string().max(512).optional().allow("", null),
}).options({ stripUnknown: true, allowUnknown: true });

/**
 * Reset password validation schema
 */
export const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  }),
  otp: Joi.string()
    .length(4)
    .pattern(/^[0-9]{4}$/)
    .required()
    .messages({
      "string.empty": "OTP is required",
      "string.length": "OTP must be 4 digits",
      "string.pattern.base": "OTP must contain only numbers",
    }),
  newPassword: Joi.string().min(6).required().messages({
    "string.empty": "New password is required",
    "string.min": "New password must be at least 6 characters",
  }),
});
