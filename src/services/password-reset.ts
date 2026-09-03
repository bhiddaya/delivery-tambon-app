// Password Reset Service with OTP

interface OTPData {
  phone: string;
  otp: string;
  createdAt: number;
  expiresAt: number;
}

interface ResetRequest {
  phone: string;
  otp: string;
  newPassword: string;
}

// In-memory OTP storage (in production, use database + SMS provider)
// This is for demo - replace with real SMS service (Twilio, AWS SNS, etc)
const OTP_STORE = new Map<string, OTPData>();
const OTP_EXPIRY = 10 * 60 * 1000; // 10 minutes

/**
 * Step 1: Request Password Reset
 * User provides phone number → System sends OTP to phone
 */
export async function requestPasswordReset(phone: string): Promise<{ success: boolean; message: string }> {
  if (!phone || phone.length < 9) {
    throw new Error('Invalid phone number');
  }

  // Generate random 6-digit OTP
  const otp = String(Math.floor(Math.random() * 900000) + 100000);

  const otpData: OTPData = {
    phone,
    otp,
    createdAt: Date.now(),
    expiresAt: Date.now() + OTP_EXPIRY,
  };

  // Store OTP in memory
  OTP_STORE.set(phone, otpData);

  // TODO: In production, send SMS via provider:
  // await sendSMS(phone, `Your OTP is: ${otp}. Valid for 10 minutes.`);

  // For demo/testing, log OTP (REMOVE IN PRODUCTION)
  console.log(`[DEMO] OTP for ${phone}: ${otp}`);

  return {
    success: true,
    message: `OTP sent to ${phone}. Check your SMS. Valid for 10 minutes.`,
  };
}

/**
 * Step 2: Verify OTP
 * User enters the OTP they received
 */
export function verifyOTP(phone: string, otp: string): { valid: boolean; message: string } {
  const storedOTP = OTP_STORE.get(phone);

  if (!storedOTP) {
    return {
      valid: false,
      message: 'No OTP request found for this phone. Please request a new OTP.',
    };
  }

  if (Date.now() > storedOTP.expiresAt) {
    OTP_STORE.delete(phone);
    return {
      valid: false,
      message: 'OTP has expired. Please request a new one.',
    };
  }

  if (storedOTP.otp !== otp) {
    return {
      valid: false,
      message: 'Invalid OTP. Please try again.',
    };
  }

  return {
    valid: true,
    message: 'OTP verified successfully.',
  };
}

/**
 * Step 3: Reset Password
 * User provides new password after OTP verification
 */
export async function resetPassword(request: ResetRequest): Promise<{ success: boolean; message: string }> {
  const { phone, otp, newPassword } = request;

  // Verify OTP first (client-side check)
  const otpVerification = verifyOTP(phone, otp);
  if (!otpVerification.valid) {
    throw new Error(otpVerification.message);
  }

  // Validate password
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  // Make API call to reset password on backend
  const apiUrl = process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api';
  const response = await fetch(`${apiUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      otp,
      newPassword,
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Password reset failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // Response is not JSON
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  // Clear OTP after successful reset
  OTP_STORE.delete(phone);

  return {
    success: true,
    message: data.message || 'Password reset successfully. Please login with your new password.',
  };
}

/**
 * Clear expired OTPs (cleanup function)
 */
export function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [phone, data] of OTP_STORE.entries()) {
    if (now > data.expiresAt) {
      OTP_STORE.delete(phone);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);
