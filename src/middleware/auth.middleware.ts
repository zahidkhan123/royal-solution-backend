import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User.model.js";

export interface AuthRequest extends Request {
  user?: IUser;
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
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      next();
    } catch (error) {
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
    if (!token) {
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
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // Authorization
      if (
        roles.length > 0 &&
        (!req.user.role || !roles.includes((req.user.role as any)[0]))
      ) {
        return res.status(403).json({
          success: false,
          message: `User role '${
            req.user.role || "unknown"
          }' is not authorized to access this route`,
        });
      }

      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
    }
  };
};

