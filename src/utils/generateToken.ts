import jwt, { SignOptions } from "jsonwebtoken";

export const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRE_IN || "7d") as unknown as number,
  } as SignOptions);
};
