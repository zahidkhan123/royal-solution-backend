/**
 * Generate a 4-digit OTP
 * @returns 4-digit OTP string
 */
export const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Calculate OTP expiry time (5 minutes from now)
 * @returns Date object representing expiry time
 */
export const getOTPExpiry = (): Date => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 5);
  return expiryTime;
};

/**
 * After a code is verified, how long the user has to set a new password
 * on the Reset Password screen (10 minutes from now).
 */
export const getResetWindowExpiry = (): Date => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 10);
  return expiryTime;
};
