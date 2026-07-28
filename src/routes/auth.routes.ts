import express from "express";
import {
  register,
  login,
  forgotPassword,
  verifyOTP,
  resetPassword,
  getProfile,
  resendOTP,
  completeProfile,
  updateProfile,
  updateProfilePut,
  getNotificationPreferences,
  putNotificationPreferences,
  singleUserSession,
  authMode,
} from "../controllers/auth.controller.js";
import {
  googleLogin,
  facebookLogin,
  appleLogin,
} from "../controllers/socialAuth.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validateBody.middleware.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOTPSchema,
  resetPasswordSchema,
  completeProfileSchema,
  updateProfileSchema,
} from "../validators/auth.validator.js";
import {
  googleLoginSchema,
  facebookLoginSchema,
  appleLoginSchema,
} from "../validators/socialAuth.validator.js";

const router = express.Router();

// Validate all imports are defined - throw error if any are missing
const imports = {
  register,
  login,
  forgotPassword,
  verifyOTP,
  resetPassword,
  getProfile,
  resendOTP,
  completeProfile,
  updateProfile,
  AuthMiddleware,
  validateBody,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOTPSchema,
  resetPasswordSchema,
  completeProfileSchema,
  updateProfileSchema,
};

const missingImports: string[] = [];
for (const [name, value] of Object.entries(imports)) {
  if (value === undefined) {
    console.error(`❌ ${name} is undefined!`);
    missingImports.push(name);
  } else {
    console.log(`✅ ${name} is defined (${typeof value})`);
  }
}

if (missingImports.length > 0) {
  throw new Error(
    `Missing required imports in auth.routes.ts: ${missingImports.join(", ")}`
  );
}

// Verify router was created
if (typeof router !== "function") {
  throw new Error("Router was not created properly");
}
console.log("✅ Router created successfully");

/**
 * @route   GET /api/auth/mode
 * @desc    Public probe — whether single-user (no login) mode is on
 * @access  Public
 */
router.get("/mode", authMode);

/**
 * @route   GET /api/auth/single-user-session
 * @desc    Mint full-access local session (no credentials). SINGLE_USER_MODE only.
 * @access  Public when single-user mode is enabled
 */
router.get("/single-user-session", singleUserSession);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */

router.post("/register", validateBody(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post("/login", validateBody(loginSchema), login);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Generate and send OTP for password reset
 * @access  Public
 */
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  forgotPassword
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP
 * @access  Public
 */
router.post("/verify-otp", validateBody(verifyOTPSchema), verifyOTP);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using OTP
 * @access  Public
 */
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  resetPassword
);

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend OTP for email verification
 * @access  Public
 */
router.post("/resend-otp", validateBody(forgotPasswordSchema), resendOTP);

/**
 * @route   GET /api/auth/profile
 * @desc    Get authenticated user profile (me)
 * @access  Private
 */
router.get("/profile", AuthMiddleware(), getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Complete user profile (mandatory after OTP)
 * @access  Private
 */
router.put(
  "/profile",
  AuthMiddleware(),
  updateProfilePut
);

/**
 * @route   PATCH /api/auth/profile
 * @desc    Update user profile (partial update)
 * @access  Private
 */
router.patch(
  "/profile",
  AuthMiddleware(),
  validateBody(updateProfileSchema),
  updateProfile
);

router.get(
  "/notification-preferences",
  AuthMiddleware(),
  getNotificationPreferences
);

router.put(
  "/notification-preferences",
  AuthMiddleware(),
  putNotificationPreferences
);

router.put(
  "/profile/complete",
  AuthMiddleware(),
  validateBody(completeProfileSchema),
  completeProfile
);

/**
 * @route   POST /api/auth/social/google
 * @desc    Login/Register with Google
 * @access  Public
 */
router.post("/social/google", validateBody(googleLoginSchema), googleLogin);

/**
 * @route   POST /api/auth/social/facebook
 * @desc    Login/Register with Facebook
 * @access  Public
 */
router.post(
  "/social/facebook",
  validateBody(facebookLoginSchema),
  facebookLogin
);

/**
 * @route   POST /api/auth/social/apple
 * @desc    Login/Register with Apple
 * @access  Public
 */
router.post("/social/apple", validateBody(appleLoginSchema), appleLogin);

export default router;
