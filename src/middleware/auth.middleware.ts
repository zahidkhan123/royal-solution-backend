import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User.model.js";
import {
  getSingleUserDocument,
  isSingleUserMode,
} from "../config/singleUser.js";

export interface AuthRequest extends Request {
  user?: IUser;
}

/** In single-user mode, attach the local full-access account when no token. */
async function attachSingleUserIfEnabled(): Promise<IUser | null> {
  if (!isSingleUserMode()) return null;
  return getSingleUserDocument();
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      const solo = await attachSingleUserIfEnabled();
      if (solo) {
        req.user = solo;
        next();
        return;
      }
      res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        const solo = await attachSingleUserIfEnabled();
        if (solo) {
          req.user = solo;
          next();
          return;
        }
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      next();
    } catch (error) {
      const solo = await attachSingleUserIfEnabled();
      if (solo) {
        req.user = solo;
        next();
        return;
      }
      res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
      return;
    }
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Handle role as array or string
    const userRoles = Array.isArray(req.user.role)
      ? req.user.role.map((r) => String(r).toLowerCase())
      : req.user.role
      ? [String(req.user.role).toLowerCase()]
      : [];

    // Normalize required roles to lowercase
    const normalizedRequiredRoles = roles.map((r) => r.toLowerCase());

    // Check if user has any of the required roles
    // Also check for "admin" or "Admin" (case-insensitive)
    // Also allow if email contains "admin" as a fallback
    const hasRequiredRole =
      normalizedRequiredRoles.some((requiredRole) => {
        return userRoles.some((userRole) => {
          return (
            userRole === requiredRole ||
            userRole === "admin" ||
            (requiredRole === "admin" && userRole === "admin")
          );
        });
      }) ||
      (normalizedRequiredRoles.includes("admin") &&
        req.user.email &&
        req.user.email.toLowerCase().includes("admin"));

    if (!hasRequiredRole) {
      res.status(403).json({
        success: false,
        message: `User role '${
          Array.isArray(req.user.role)
            ? req.user.role.join(", ")
            : req.user.role || "unknown"
        }' is not authorized to access this route. Required roles: ${roles.join(
          ", "
        )}`,
      });
      return;
    }
    next();
  };
};

/** Optional auth: attach user if token present, never 401 */
export const optionalAuth = async (
  req: AuthRequest,
  _: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      next();
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };
      req.user = await User.findById(decoded.id).select("-password");
    } catch {
      // invalid token - continue without user
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** Admin-only: protect + authorize("admin") */
export const requireAdminAuth = [protect, authorize("admin")];

// Auth middleware to check if user is authenticated and authorized
export const AuthMiddleware = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Authentication
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    const authorizeRoles = (): boolean => {
      if (roles.length === 0) return true;
      if (!req.user?.role) return false;
      const userRoles = (
        Array.isArray(req.user.role) ? req.user.role : [req.user.role]
      ).map((r) => String(r).toLowerCase());
      const needed = roles.map((r) => r.toLowerCase());
      // Admin always passes role gates in single-user / staff setups
      if (userRoles.includes("admin")) return true;
      return needed.some((n) => userRoles.includes(n));
    };

    if (!token) {
      const solo = await attachSingleUserIfEnabled();
      if (solo) {
        req.user = solo;
        if (!authorizeRoles()) {
          return res.status(403).json({
            success: false,
            message: "Not authorized for this route",
          });
        }
        return next();
      }
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        const solo = await attachSingleUserIfEnabled();
        if (solo) {
          req.user = solo;
          if (!authorizeRoles()) {
            return res.status(403).json({
              success: false,
              message: "Not authorized for this route",
            });
          }
          return next();
        }
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      if (!authorizeRoles()) {
        return res.status(403).json({
          success: false,
          message: `User role '${
            req.user.role || "unknown"
          }' is not authorized to access this route`,
        });
      }

      return next();
    } catch (error) {
      const solo = await attachSingleUserIfEnabled();
      if (solo) {
        req.user = solo;
        if (!authorizeRoles()) {
          return res.status(403).json({
            success: false,
            message: "Not authorized for this route",
          });
        }
        return next();
      }
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
    }
  };
};

