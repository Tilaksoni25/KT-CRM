const crypto = require('crypto');
const { hashSha256 } = require('../utils/hash');
const { sendEmail } = require('./email.service');

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 * @returns {string}
 */
const generateOtpCode = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Send an OTP to a user
 * @param {import('../models/User')} user - User mongoose document (must be selected with +otp)
 * @param {'login' | '2fa_setup'} purpose 
 * @returns {Promise<{ success: boolean, message: string, expiresInSeconds: number }>}
 */
const sendOtp = async (user, purpose) => {
  const now = Date.now();

  // Check 60-second rate limit:
  // If an OTP already exists and expires in more than 4 minutes, it was generated less than 60s ago (since lifespan is 5m)
  if (user.otp && user.otp.expiresAt) {
    const timeRemainingMs = user.otp.expiresAt.getTime() - now;
    const timeElapsedMs = (5 * 60 * 1000) - timeRemainingMs;
    
    // Check if it's been less than 60 seconds since last generation
    if (timeElapsedMs > 0 && timeElapsedMs < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - timeElapsedMs) / 1000);
      throw new Error(`Please wait ${waitSeconds} seconds before requesting a new OTP.`);
    }
  }

  const otpCode = generateOtpCode();
  const expiresAt = new Date(now + 5 * 60 * 1000); // 5 minutes validity

  // Save the hashed OTP code in user document
  user.otp = {
    codeHash: hashSha256(otpCode),
    purpose,
    attempts: 0,
    expiresAt
  };

  await user.save();

  // Send the OTP code via email
  const subject = `Your Kevalon ERP Verification Code`;
  const text = `Your 6-digit verification code is: ${otpCode}. This code is valid for 5 minutes and is used for ${purpose === '2fa_setup' ? 'setting up 2FA' : 'logging in'}.`;
  const html = `<p>Your 6-digit verification code is: <strong>${otpCode}</strong></p><p>This code is valid for 5 minutes and is used for <strong>${purpose === '2fa_setup' ? 'setting up 2FA' : 'logging in'}</strong>.</p>`;

  await sendEmail({ to: user.email, subject, text, html });

  return {
    success: true,
    message: 'OTP sent successfully',
    expiresInSeconds: 300
  };
};

/**
 * Verify a user's OTP
 * @param {import('../models/User')} user - User document (must be selected with +otp)
 * @param {string} rawOtp 
 * @param {'login' | '2fa_setup'} purpose 
 * @returns {Promise<boolean>}
 */
const verifyOtp = async (user, rawOtp, purpose) => {
  if (!user.otp || !user.otp.codeHash) {
    throw new Error('No active OTP found. Please request a new OTP.');
  }

  // Check expiry
  if (Date.now() > user.otp.expiresAt.getTime()) {
    // Clear expired OTP
    user.otp = undefined;
    await user.save();
    throw new Error('OTP has expired. Please request a new OTP.');
  }

  // Check purpose
  if (user.otp.purpose !== purpose) {
    throw new Error('Invalid OTP purpose.');
  }

  const matches = user.otp.codeHash === hashSha256(rawOtp);

  if (!matches) {
    user.otp.attempts += 1;

    // Check if attempts exceeded (max 3, meaning invalidate on the 3rd failed attempt)
    if (user.otp.attempts >= 3) {
      user.otp = undefined; // clear otp
      await user.save();
      throw new Error('Too many attempts. This OTP has been invalidated, please request a new OTP.');
    }

    await user.save();
    return false;
  }

  // Clear OTP on success
  user.otp = undefined;
  await user.save();
  return true;
};

module.exports = {
  sendOtp,
  verifyOtp
};
