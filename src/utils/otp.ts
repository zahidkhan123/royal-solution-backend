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
