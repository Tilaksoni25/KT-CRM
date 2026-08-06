const User = require('../models/User');
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const FinancialYear = require('../models/FinancialYear');
const { hashPassword, comparePassword, hashSha256 } = require('../utils/hash');
const { createSession, rotateSession, revokeSession, revokeAllSessions } = require('../services/token.service');
const { sendEmail, sendVerificationEmail } = require('../services/email.service');
const { sendOtp, verifyOtp } = require('../services/otp.service');
const env = require('../config/env');
const crypto = require('crypto');
const pino = require('pino');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

// Helper to mask email address: example@domain.com -> e***@domain.com
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const maskedName = name[0] + '***';
  return `${maskedName}@${domain}`;
};

/**
 * Return the UI routing decision after login. The company record is the source
 * of truth, while the three User flags keep onboarding state easy to consume.
 */
const getOnboardingStatus = async (user) => {
  const activeAccess = (user.companyAccess || []).find((access) => access.isActive);
  const companyId = companyId || activeAccess?.companyId || null;
  if (!companyId) {
    return { companyCreated: false, branchCreated: false, financialYearCreated: false, companyId: null, redirectTo: 'COMPANY_REGISTRATION' };
  }

  const company = await Company.findById(companyId).select('_id');
  if (!company) return { companyCreated: false, branchCreated: false, financialYearCreated: false, companyId: null, redirectTo: 'COMPANY_REGISTRATION' };
  const [branchCreated, financialYearCreated] = await Promise.all([
    Branch.exists({ companyId: company._id }), FinancialYear.exists({ companyId: company._id })
  ]);
  return {
    companyCreated: true,
    branchCreated: Boolean(branchCreated),
    financialYearCreated: Boolean(financialYearCreated),
    companyId: company._id.toString(),
    // Company existence controls the requested first screen. Branch/FY flags
    // let the dashboard show any remaining setup checklist.
    redirectTo: 'DASHBOARD'
  };
};

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email address is already registered'
      });
    }

    // Hash password with 12 rounds
    const passwordHash = await hashPassword(password);

    // Generate email verification token (plain stored for email; hash stored in DB)
    const plainVerificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = hashSha256(plainVerificationToken);
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user with verification token
    const newUser = await User.create({
      name,
      email,
      passwordHash,
      phone,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpires
    });

    // Send verification email (non-blocking — do not fail register if email fails)
    sendVerificationEmail(newUser.email, plainVerificationToken).catch((err) => {
      logger.error({ userId: newUser._id }, `Failed to send verification email: ${err.message}`);
    });

    logger.info({ userId: newUser._id }, `User registered successfully`);

    return res.status(201).json({
      success: true,
      message: 'Registered successfully. Please check your email to verify your account.',
      data: {
        userId: newUser._id,
        email: newUser.email
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Fetch user and explicitly select passwordHash
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check lock status
    if (user.isLocked) {
      const waitMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / (60 * 1000));
      return res.status(423).json({
        success: false,
        message: `Account is locked due to multiple failed login attempts. Please try again in ${waitMinutes} minutes.`
      });
    }

    // Guard against invited users who haven't completed password setup yet
    // (passwordHash is null until the invite link is used to set a password)
    if (!user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'Your account was created via an invite. Please set your password using the invite link sent to your email before logging in.'
      });
    }

    // Compare passwords
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment login attempts
      user.loginAttempts += 1;

      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // lock for 15 minutes
        logger.warn({ userId: user._id }, `User account locked due to too many failed attempts`);
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Reset login attempts on success
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Trigger OTP generation and email dispatch
      // Load user with otp schema fields
      const userWithOtp = await User.findById(user._id).select('+otp');
      const otpResult = await sendOtp(userWithOtp, 'login');

      logger.info({ userId: user._id }, `2FA required for login. OTP dispatched.`);

      return res.status(200).json({
        success: true,
        twoFactorRequired: true,
        otpSentTo: maskEmail(user.email)
      });
    }

    // Establish session
    const tokens = await createSession(user, req.ip, req.headers['user-agent']);
    const onboarding = await getOnboardingStatus(user);

    logger.info({ userId: user._id }, `User logged in successfully`);

    return res.status(200).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        onboarding
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh-token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokens = await rotateSession(refreshToken, req.ip, req.headers['user-agent']);

    return res.status(200).json({
      success: true,
      data: tokens
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    // req.user is loaded in authenticate middleware
    await revokeSession(req.user, refreshToken);

    logger.info({ userId: req.user._id }, `User logged out successfully`);

    return res.status(200).json({
      success: true,
      message: 'Logged out'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
const me = async (req, res, next) => {
  try {
    // req.user is attached by authenticate middleware
    const user = req.user;

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Search user
    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpires');

    if (user) {
      // Generate clean token
      const plainToken = crypto.randomBytes(32).toString('hex');
      
      // Store hashed token + 15 min expiry
      user.passwordResetTokenHash = hashSha256(plainToken);
      user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
      
      await user.save();

      // Email plain token
      const resetLink = `${env.CLIENT_URL}/reset-password?token=${plainToken}`;
      const subject = 'Password Reset Request';
      const text = `To reset your Kevalon ERP password, please click the following link (valid for 15 minutes):\n\n${resetLink}`;
      const html = `<p>You requested a password reset for Kevalon ERP.</p><p>Please click the link below to set a new password (valid for 15 minutes):</p><p><a href="${resetLink}">${resetLink}</a></p>`;

      await sendEmail({ to: user.email, subject, text, html });
      logger.info({ userId: user._id }, `Password reset token generated and sent`);
    } else {
      logger.info(`Password reset requested for non-existent email: ${email}`);
    }

    // Always return generic message to prevent account enumeration
    return res.status(200).json({
      success: true,
      message: 'If that email exists, a reset link has been sent'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashSha256(token);

    // Fetch user matching hash and verify expiry — include +passwordHash so we can update it
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordResetTokenHash +passwordResetExpires +refreshTokens +passwordHash');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.'
      });
    }

    // Set new password
    user.passwordHash = await hashPassword(newPassword);
    
    // Clear reset tokens
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;

    // Force re-login on all devices
    user.refreshTokens = [];

    await user.save();

    logger.info({ userId: user._id }, `Password reset successfully. Sessions revoked.`);

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. Please login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/send-otp
 */
const sendOtpController = async (req, res, next) => {
  try {
    const { email, purpose } = req.body;

    const user = await User.findOne({ email }).select('+otp');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const otpResult = await sendOtp(user, purpose);

    return res.status(200).json({
      success: true,
      message: otpResult.message,
      expiresInSeconds: otpResult.expiresInSeconds
    });
  } catch (error) {
    // If rate limit error occurs, return it nicely
    if (error.message.includes('Please wait')) {
      return res.status(429).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * POST /api/auth/verify-otp
 */
const verifyOtpController = async (req, res, next) => {
  try {
    const { email, otp, purpose } = req.body;

    const user = await User.findOne({ email }).select('+otp +refreshTokens');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let isValid = false;
    try {
      isValid = await verifyOtp(user, otp, purpose);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code'
      });
    }

    if (purpose === 'login') {
      // Complete login, issue tokens
      const tokens = await createSession(user, req.ip, req.headers['user-agent']);
      const onboarding = await getOnboardingStatus(user);
      
      logger.info({ userId: user._id }, `2FA login successful`);

      return res.status(200).json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
          },
          onboarding
        }
      });
    } else if (purpose === '2fa_setup') {
      // Enable 2FA on profile
      user.twoFactorEnabled = true;
      await user.save();

      logger.info({ userId: user._id }, `2FA setup completed and enabled`);

      return res.status(200).json({
        success: true,
        message: '2FA has been successfully enabled.'
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-email
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    const tokenHash = hashSha256(token);

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() }
    }).select('+emailVerificationTokenHash +emailVerificationExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has expired. Please request a new one.'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info({ userId: user._id }, 'Email verified successfully');

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-verification-email
 */
const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email }).select('+emailVerificationTokenHash +emailVerificationExpires');

    if (user && !user.isEmailVerified) {
      // Enforce 60-second per-email cooldown using the existing expiry field:
      // a token just created has ~24h remaining; one created >60s ago has slightly less.
      if (user.emailVerificationExpires) {
        const maxExpiry = 24 * 60 * 60 * 1000;
        const remaining = user.emailVerificationExpires.getTime() - Date.now();
        const elapsed = maxExpiry - remaining;
        if (elapsed > 0 && elapsed < 60 * 1000) {
          const waitSeconds = Math.ceil((60 * 1000 - elapsed) / 1000);
          // Still return 200 — never reveal that the email exists or is cooling down
          logger.info({ email }, `Verification email resend rate-limited (${waitSeconds}s remaining)`);
          return res.status(200).json({
            success: true,
            message: 'If that email exists and is unverified, a new verification link has been sent.'
          });
        }
      }

      const plainVerificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationTokenHash = hashSha256(plainVerificationToken);
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();

      sendVerificationEmail(user.email, plainVerificationToken).catch((err) => {
        logger.error({ userId: user._id }, `Failed to resend verification email: ${err.message}`);
      });

      logger.info({ userId: user._id }, 'Verification email resent');
    }

    // Always return the same generic response (anti-enumeration)
    return res.status(200).json({
      success: true,
      message: 'If that email exists and is unverified, a new verification link has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/sessions
 */
const listSessions = async (req, res, next) => {
  try {
    // Load refreshTokens (select:false by default)
    const user = await User.findById(req.user._id).select('+refreshTokens');

    const now = Date.now();
    const activeSessions = (user.refreshTokens || []).filter(
      (t) => !t.revoked && new Date(t.expiresAt).getTime() > now
    );

    // The current access token carries the userId but NOT the current refresh token hash.
    // We cannot identify "isCurrent" via the access token alone — clients should pass
    // the current refreshToken in a header/cookie for this flag. We mark all as false
    // by default; clients can match by sessionId if needed.
    const sessions = activeSessions.map((t) => ({
      sessionId: t._id,
      userAgent: t.userAgent,
      ip: t.ip,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt || null,
      expiresAt: t.expiresAt,
      isCurrent: false // extended by clients matching their stored refresh token's sessionId
    }));

    return res.status(200).json({
      success: true,
      data: sessions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/auth/sessions/:id
 */
const revokeSessionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.user._id).select('+refreshTokens');

    const session = (user.refreshTokens || []).find(
      (t) => t._id.toString() === id
    );

    // Return 404 if not found (also covers sessions that belong to other users — never leak)
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Mark as revoked — next /refresh-token call with this token will fail with 401
    session.revoked = true;
    await user.save();

    logger.info({ userId: user._id, sessionId: id }, 'Session revoked via device management');

    return res.status(200).json({
      success: true,
      message: 'Session revoked'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  me,
  forgotPassword,
  resetPassword,
  sendOtp: sendOtpController,
  verifyOtp: verifyOtpController,
  verifyEmail,
  resendVerificationEmail,
  listSessions,
  revokeSessionById
};
