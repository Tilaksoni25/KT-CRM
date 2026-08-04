const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { hashSha256 } = require('../utils/hash');
const User = require('../models/User');

/**
 * Clean up expired refresh tokens from user's list
 * @param {Array} refreshTokens 
 * @returns {Array}
 */
const filterExpiredTokens = (refreshTokens) => {
  const now = Date.now();
  return refreshTokens.filter((token) => new Date(token.expiresAt).getTime() > now);
};

/**
 * Create a new session for a user (attaching a new refresh token)
 * @param {import('../models/User')} user - User document
 * @param {string} ip 
 * @param {string} userAgent 
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
const createSession = async (user, ip, userAgent) => {
  // Re-fetch user with refreshTokens if not already selected
  if (!Array.isArray(user.refreshTokens)) {
    user = await User.findById(user._id).select('+refreshTokens');
  }

  const payload = { userId: user._id.toString(), email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const plainRefreshToken = generateRefreshToken({ userId: user._id.toString() });

  const tokenHash = hashSha256(plainRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Clean expired tokens first
  let tokens = filterExpiredTokens(user.refreshTokens || []);

  // Add new session token
  tokens.push({
    tokenHash,
    userAgent,
    ip,
    createdAt: new Date(),
    expiresAt,
    revoked: false
  });

  user.refreshTokens = tokens;
  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken,
    refreshToken: plainRefreshToken
  };
};

/**
 * Rotate access and refresh tokens using a valid refresh token.
 * Detects token reuse and revokes all sessions on violation.
 * @param {string} plainRefreshToken 
 * @param {string} ip 
 * @param {string} userAgent 
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
const rotateSession = async (plainRefreshToken, ip, userAgent) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(plainRefreshToken);
  } catch (err) {
    const error = new Error('Invalid or expired refresh token');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(decoded.userId).select('+refreshTokens');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 401;
    throw error;
  }

  // Account lockout check
  if (user.isLocked) {
    const error = new Error('Account is locked');
    error.statusCode = 403;
    throw error;
  }

  const tokenHash = hashSha256(plainRefreshToken);
  
  // Clean expired tokens first to save space
  user.refreshTokens = filterExpiredTokens(user.refreshTokens || []);

  const tokenIndex = user.refreshTokens.findIndex((t) => t.tokenHash === tokenHash);

  if (tokenIndex === -1) {
    // If not found, it is either invalid, or was rotated and deleted, or is a reuse attempt from a cleared state.
    // If we want reuse detection on recently rotated tokens, we can check if it exists but was marked as revoked.
    // If it's completely missing, we treat it as unauthorized.
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    throw error;
  }

  const matchedToken = user.refreshTokens[tokenIndex];

  // If token is already marked revoked, this is a token reuse violation!
  if (matchedToken.revoked) {
    // Revoke all sessions for this user (security policy)
    user.refreshTokens = [];
    await user.save();
    
    const error = new Error('Refresh token reuse detected. All active sessions have been revoked.');
    error.statusCode = 401;
    throw error;
  }

  // Valid token rotation: stamp lastUsedAt then mark as revoked
  matchedToken.lastUsedAt = new Date();
  matchedToken.revoked = true;

  // Generate new tokens
  const payload = { userId: user._id.toString(), email: user.email, role: user.role };
  const newAccessToken = generateAccessToken(payload);
  const newPlainRefreshToken = generateRefreshToken({ userId: user._id.toString() });

  const newTokenHash = hashSha256(newPlainRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Add the new valid refresh token
  user.refreshTokens.push({
    tokenHash: newTokenHash,
    userAgent,
    ip,
    createdAt: new Date(),
    expiresAt,
    revoked: false
  });

  await user.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newPlainRefreshToken
  };
};

/**
 * Revoke a specific refresh token (Logout)
 * @param {import('../models/User')} user 
 * @param {string} plainRefreshToken 
 */
const revokeSession = async (user, plainRefreshToken) => {
  // Re-fetch user with refreshTokens if not already selected
  if (!Array.isArray(user.refreshTokens)) {
    user = await User.findById(user._id).select('+refreshTokens');
  }

  const tokenHash = hashSha256(plainRefreshToken);
  
  // Remove the specific token
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  await user.save();
};

/**
 * Revoke all active sessions for a user
 * @param {import('../models/User')} user 
 */
const revokeAllSessions = async (user) => {
  // Re-fetch user with refreshTokens if not already selected
  if (!Array.isArray(user.refreshTokens)) {
    user = await User.findById(user._id).select('+refreshTokens');
  }

  user.refreshTokens = [];
  await user.save();
};

module.exports = {
  createSession,
  rotateSession,
  revokeSession,
  revokeAllSessions
};
