const express = require('express');
const {
  register,
  login,
  refreshToken,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  sendOtp,
  verifyOtp,
  verifyEmail,
  resendVerificationEmail,
  listSessions,
  revokeSessionById
} = require('../controllers/auth.controller');

const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  verifyEmailSchema,
  resendVerificationEmailSchema
} = require('../validators/auth.validators');

const router = express.Router();

// 1. Register a new user
router.post('/register', authLimiter, validateRequest(registerSchema), register);

// 2. Login, returns JWT or prompts 2FA OTP
router.post('/login', authLimiter, validateRequest(loginSchema), login);

// 3. Rotate refresh tokens
router.post('/refresh-token', validateRequest(refreshTokenSchema), refreshToken);

// 4. Invalidate the current refresh token (Logout)
router.post('/logout', authenticate, validateRequest(logoutSchema), logout);

// 5. Get current logged-in user profile
router.get('/me', authenticate, me);

// 6. Request password-reset link
router.post('/forgot-password', authLimiter, validateRequest(forgotPasswordSchema), forgotPassword);

// 7. Reset password using valid token
router.post('/reset-password', authLimiter, validateRequest(resetPasswordSchema), resetPassword);

// 7.1 Change password for authenticated user
router.post('/change-password', authenticate, validateRequest(changePasswordSchema), changePassword);

// 8. Dispatch 6-digit OTP code (login or 2fa_setup)
router.post('/send-otp', authLimiter, validateRequest(sendOtpSchema), sendOtp);

// 9. Verify OTP code and complete action
router.post('/verify-otp', authLimiter, validateRequest(verifyOtpSchema), verifyOtp);

// 10. Verify email address via emailed token
router.post('/verify-email', authLimiter, validateRequest(verifyEmailSchema), verifyEmail);

// 11. Resend email verification link (rate-limited; anti-enumeration)
router.post('/resend-verification-email', authLimiter, validateRequest(resendVerificationEmailSchema), resendVerificationEmail);

// 12. List all active sessions for the logged-in user
router.get('/sessions', authenticate, listSessions);

// 13. Revoke a specific session by its subdocument _id
router.delete('/sessions/:id', authenticate, revokeSessionById);

module.exports = router;
