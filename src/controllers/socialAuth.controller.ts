import { Response, NextFunction } from "express";
import User, { AuthProvider, UserRole } from "../models/User.model.js";
import { generateToken } from "../utils/jwt.js";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { ValidatedRequest } from "../middleware/validateBody.middleware.js";
import crypto from "crypto";
import { verifyAppleIdToken } from "../utils/appleAuth.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const facebookAppId = process.env.FACEBOOK_APP_ID;
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;

const getFacebookAppSecretProof = (accessToken: string): string | undefined => {
  if (!facebookAppSecret) return undefined;

  return crypto
    .createHmac("sha256", facebookAppSecret)
    .update(accessToken)
    .digest("hex");
};

const FULL_ACCESS_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.CONTRACTOR,
  UserRole.USER,
];

/**
 * Verify Google ID token or access token and create/login user
 * POST /api/auth/social/google
 */
export const googleLogin = async (
  req: ValidatedRequest,
  res: Response,
  _: NextFunction
): Promise<void> => {
  try {
    const { idToken, accessToken } = req.validatedBody!;

    if (!idToken && !accessToken) {
      res.status(400).json({
        success: false,
        message: "Google ID token or access token is required",
      });
      return;
    }

    let payload: any;
    let socialId: string;
    let email: string;
    let name: string;
    let picture: string | undefined;
    let isGoogleEmailVerified = false;

    if (idToken) {
      // Verify ID token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const tokenPayload = ticket.getPayload();
      if (!tokenPayload) {
        res.status(400).json({
          success: false,
          message: "Invalid Google token",
        });
        return;
      }

      payload = tokenPayload;
      socialId = payload.sub;
      email = payload.email || "";
      name = payload.name || "";
      picture = payload.picture;
      isGoogleEmailVerified = payload.email_verified === true;
    } else if (accessToken) {
      // Verify access token by fetching user info
      try {
        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        const userInfo = userInfoResponse.data;
        socialId = userInfo.sub || userInfo.id;
        email = userInfo.email || "";
        name = userInfo.name || "";
        picture = userInfo.picture;
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: "Invalid Google access token",
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        message: "Google token is required",
      });
      return;
    }

    if (!email || !name) {
      res.status(400).json({
        success: false,
        message: "Email and name are required from Google account",
      });
      return;
    }

    if (idToken && !isGoogleEmailVerified) {
      res.status(400).json({
        success: false,
        message: "Google account email is not verified",
      });
      return;
    }

    // Check if user exists with this email
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - update provider if needed
      if (user.provider !== AuthProvider.GOOGLE) {
        user.provider = AuthProvider.GOOGLE;
        user.socialId = socialId;
        if (picture && !user.profileImage) {
          user.profileImage = picture;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.socialId) {
        user.socialId = socialId;
        if (picture && !user.profileImage) {
          user.profileImage = picture;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.isVerified) {
        user.isVerified = true;
        user.verifiedAt = new Date();
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        fullName: name,
        email: email.toLowerCase(),
        provider: AuthProvider.GOOGLE,
        socialId,
        profileImage: picture,
        role: FULL_ACCESS_ROLES,
        isVerified: true, // Google accounts are considered verified
        verifiedAt: new Date(),
      });
    }

    // Generate JWT token
    const token = generateToken((user._id as any).toString());

    res.status(200).json({
      success: true,
      message: "Google login successful",
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          city: user.city,
          role: user.role,
          gender: user.gender,
          profileImage: user.profileImage,
          isVerified: user.isVerified,
          isProfileCompleted: Boolean(user.isProfileCompleted ?? false),
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error("Google login error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Google authentication failed",
    });
  }
};

/**
 * Verify Facebook access token and create/login user
 * POST /api/auth/social/facebook
 */
export const facebookLogin = async (
  req: ValidatedRequest,
  res: Response,
  _: NextFunction
): Promise<void> => {
  try {
    const { accessToken } = req.validatedBody!;

    const accessTokenTrimmed =
      typeof accessToken === "string" ? accessToken.trim() : "";

    if (!accessTokenTrimmed) {
      res.status(400).json({
        success: false,
        message: "Facebook access token is required",
      });
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Facebook login debug:", {
        accessTokenLength: accessTokenTrimmed.length,
        facebookAppIdConfigured: !!facebookAppId,
        facebookAppSecretConfigured: !!facebookAppSecret,
      });
    }

    const strictValidation =
      process.env.FACEBOOK_STRICT_VALIDATION === "true";

    const useAppSecretProof =
      process.env.FACEBOOK_USE_APP_SECRET_PROOF === "true";

    // Optional stricter validation with app credentials when configured.
    if (strictValidation && facebookAppId && facebookAppSecret) {
      const appToken = `${facebookAppId}|${facebookAppSecret}`;
      const debugResponse = await axios.get(
        "https://graph.facebook.com/debug_token",
        {
          params: {
            input_token: accessTokenTrimmed,
            access_token: appToken,
          },
        }
      );

      const debugData = debugResponse.data?.data;
      if (
        !debugData?.is_valid ||
        (debugData?.app_id && debugData.app_id !== facebookAppId)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid Facebook access token",
        });
        return;
      }
    }

    // Verify Facebook token and get user info
    const response = await axios.get("https://graph.facebook.com/me", {
      params: {
        fields: "id,name,email,picture.type(large)",
        access_token: accessTokenTrimmed,
        ...(useAppSecretProof
          ? {
              appsecret_proof: getFacebookAppSecretProof(accessTokenTrimmed),
            }
          : {}),
      },
    });

    const { id: socialId, email, name, picture } = response.data;

    if (!email || !name) {
      res.status(400).json({
        success: false,
        message: "Email and name are required from Facebook account",
      });
      return;
    }

    const profileImage = picture?.data?.url;

    // Check if user exists with this email
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - update provider if needed
      if (user.provider !== AuthProvider.FACEBOOK) {
        user.provider = AuthProvider.FACEBOOK;
        user.socialId = socialId;
        if (profileImage && !user.profileImage) {
          user.profileImage = profileImage;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.socialId) {
        user.socialId = socialId;
        if (profileImage && !user.profileImage) {
          user.profileImage = profileImage;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.isVerified) {
        user.isVerified = true;
        user.verifiedAt = new Date();
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        fullName: name,
        email: email.toLowerCase(),
        provider: AuthProvider.FACEBOOK,
        socialId,
        profileImage,
        role: FULL_ACCESS_ROLES,
        isVerified: true, // Facebook accounts are considered verified
        verifiedAt: new Date(),
      });
    }

    // Generate JWT token
    const token = generateToken((user._id as any).toString());

    res.status(200).json({
      success: true,
      message: "Facebook login successful",
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          city: user.city,
          role: user.role,
          gender: user.gender,
          profileImage: user.profileImage,
          isVerified: user.isVerified,
          isProfileCompleted: Boolean(user.isProfileCompleted ?? false),
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error("Facebook login error:", error);
    res.status(400).json({
      success: false,
      message: error.response?.data?.error?.message || error.message || "Facebook authentication failed",
    });
  }
};

/**
 * Verify Apple ID token and create/login user
 * POST /api/auth/social/apple
 */
export const appleLogin = async (
  req: ValidatedRequest,
  res: Response,
  _: NextFunction
): Promise<void> => {
  try {
    const { idToken, user: appleUser } = req.validatedBody!;

    if (!idToken) {
      res.status(400).json({
        success: false,
        message: "Apple ID token is required",
      });
      return;
    }

    // Verify the token's signature, issuer, audience and expiry with Apple's
    // public keys. Never trust the payload of an unverified token: anyone can
    // forge one with any email and take over that account.
    let identity;
    try {
      identity = await verifyAppleIdToken(idToken);
    } catch (verifyError: any) {
      console.error("Apple token verification failed:", verifyError?.message);
      res.status(401).json({
        success: false,
        message: "Invalid or expired Apple sign-in. Please try again.",
      });
      return;
    }

    const { sub: socialId } = identity;
    // Only trust an email Apple says is verified.
    const email = identity.emailVerified ? identity.email : undefined;
    const fullName = appleUser?.fullName
      ? `${appleUser.fullName.givenName || ""} ${appleUser.fullName.familyName || ""}`.trim()
      : email?.split("@")[0] || "Apple User";

    // Match on the stable Apple user id first: Apple may omit or change the
    // email (e.g. "Hide My Email"), which used to create duplicate empty
    // accounts. Fall back to email to link an existing account on first use.
    let user = await User.findOne({
      provider: AuthProvider.APPLE,
      socialId,
    });
    if (!user && email) {
      user = await User.findOne({ email });
    }

    if (user) {
      // User exists - update provider if needed
      if (user.provider !== AuthProvider.APPLE) {
        user.provider = AuthProvider.APPLE;
        user.socialId = socialId;
        if (fullName && !user.fullName) {
          user.fullName = fullName;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.socialId) {
        user.socialId = socialId;
        if (fullName && !user.fullName) {
          user.fullName = fullName;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          user.verifiedAt = new Date();
        }
        await user.save();
      } else if (!user.isVerified) {
        user.isVerified = true;
        user.verifiedAt = new Date();
        await user.save();
      }
    } else {
      // Create new user
      // Note: Apple may not provide email on subsequent logins
      const userEmail = email || `${socialId}@privaterelay.appleid.com`;

      user = await User.create({
        fullName,
        email: userEmail.toLowerCase(),
        provider: AuthProvider.APPLE,
        socialId,
        role: FULL_ACCESS_ROLES,
        isVerified: true, // Apple accounts are considered verified
        verifiedAt: new Date(),
      });
    }

    // Generate JWT token
    const token = generateToken((user._id as any).toString());

    res.status(200).json({
      success: true,
      message: "Apple login successful",
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          city: user.city,
          role: user.role,
          gender: user.gender,
          profileImage: user.profileImage,
          isVerified: user.isVerified,
          isProfileCompleted: Boolean(user.isProfileCompleted ?? false),
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error("Apple login error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Apple authentication failed",
    });
  }
};

