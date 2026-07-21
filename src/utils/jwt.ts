import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
/**
 * Generate JWT token
 * @param userId - User ID to encode in token
 * @returns JWT token string
 */
export const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRE_IN || "7d";
  console.log("expiresIn", expiresIn);
  console.log("process.env.JWT_EXPIRE_IN", process.env.JWT_EXPIRE_IN);
  console.log("process.env.JWT_SECRET", process.env.JWT_SECRET);
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  return jwt.sign({ id: userId }, secret as string, {
    expiresIn: expiresIn as unknown as number,
  });
};

/**
 * Verify JWT token
 * @param token - JWT token to verify
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): { id: string } => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  return jwt.verify(token, secret) as { id: string };
};
