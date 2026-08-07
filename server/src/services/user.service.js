const crypto = require('crypto');
const User = require('../models/User');
const { hashPassword, hashSha256 } = require('../utils/hash');
const { sendInviteEmail, sendTemporaryPasswordEmail } = require('./email.service');
const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invite token validity in hours.
 * 48 hours (vs. Module 1's 15-minute forgot-password expiry) because
 * the recipient may not check their email immediately.
 * Override with INVITE_TOKEN_EXPIRY_HOURS in .env if needed.
 */
const INVITE_TOKEN_EXPIRY_HOURS = parseInt(
  process.env.INVITE_TOKEN_EXPIRY_HOURS || '48',
  10
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a safe per-company user response object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Project a User document into a safe per-company view.
 * Only includes the role/status from the matching companyAccess entry — never leaks
 * another company's access info.
 * @param {Object} user   - Mongoose User document
 * @param {string} companyId
 * @returns {Object}
 */
const toCompanyUserView = (user, companyId) => {
  const access = (user.companyAccess || []).find(
    (a) => a.companyId.toString() === companyId.toString()
  );
  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: access ? access.role : null,
    isActive: access ? access.isActive : null,
    invitedAt: access ? access.invitedAt : null,
    joinedAt: access ? access.joinedAt : null
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Self-lockout guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if deactivating the given companyId entry would lock the caller
 * out of their last remaining active company.
 * @param {Object} callerUser - full User document (companyAccess populated)
 * @param {string} companyId  - the company being deactivated
 * @returns {boolean}
 */
const wouldSelfLockout = (callerUser, targetUserId, companyId) => {
  // Only relevant when the caller is updating their own record
  if (callerUser._id.toString() !== targetUserId.toString()) return false;

  const activeEntries = (callerUser.companyAccess || []).filter((a) => a.isActive);
  if (activeEntries.length > 1) return false; // they have other active companies

  const targetEntry = activeEntries.find(
    (a) => a.companyId.toString() === companyId.toString()
  );
  return !!targetEntry; // if the single active entry is the one being deactivated → lockout
};

// ─────────────────────────────────────────────────────────────────────────────
// Core invite / access-grant logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invite a user to a company.
 * - Creates a new User with null passwordHash + sends invite email (new email).
 * - Adds a companyAccess entry to an existing User (known email).
 *
 * @param {Object}  params
 * @param {string}  params.companyId
 * @param {string}  params.name
 * @param {string}  params.email
 * @param {string}  [params.phone]
 * @param {string}  params.role
 * @param {string}  params.companyName  — used in the invite email subject
 * @returns {Promise<{ isNewUser: boolean, user: Object }>}
 */
const inviteUser = async ({ companyId, name, email, phone, role, companyName, sendTemporaryPassword }) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    // Check if already has access to this company
    const alreadyHasAccess = (existingUser.companyAccess || []).some(
      (a) => a.companyId.toString() === companyId.toString()
    );
    if (alreadyHasAccess) {
      const err = new Error('User already has access to this company');
      err.statusCode = 409;
      err.errorCode = 'USER_ALREADY_HAS_ACCESS';
      throw err;
    }

    // Grant access to the new company
    existingUser.companyAccess.push({
      companyId,
      role,
      isActive: true,
      invitedAt: new Date(),
      joinedAt: null
    });
    await existingUser.save();

    // Generate an invite token for the existing user so they can set password
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256(plainToken);
    const tokenExpiry = new Date(Date.now() + INVITE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    existingUser.passwordResetTokenHash = tokenHash;
    existingUser.passwordResetExpires = tokenExpiry;

    try {
      await sendInviteEmail(email, plainToken, companyName);
      // mark inviteSent on the newly added companyAccess entry
      const idx = existingUser.companyAccess.findIndex(a => a.companyId.toString() === companyId.toString());
      if (idx !== -1) {
        existingUser.companyAccess[idx].inviteSent = true;
      }
      await existingUser.save();
    } catch (err) {
      const pino = require('pino');
      const logger = pino();
      logger.error({ userId: existingUser._id }, `Failed to send invite email to existing user: ${err.message}`);
    }

    return { isNewUser: false, user: existingUser };
  }

  if (sendTemporaryPassword) {
    const temporaryPassword = crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, 'A').slice(0, 10);
    const passwordHash = await hashPassword(temporaryPassword);

    const newUser = await User.create({
      name,
      email,
      phone,
      role,
      passwordHash,
      mustChangePassword: true,
      isEmailVerified: false,
      companyAccess: [{
        companyId,
        role,
        isActive: true,
        invitedAt: new Date(),
        joinedAt: null
      }]
    });

    try {
      await sendTemporaryPasswordEmail(email, temporaryPassword, companyName);
      newUser.companyAccess[0].inviteSent = true;
      await newUser.save();
    } catch (err) {
      const pino = require('pino');
      const logger = pino();
      logger.error({ userId: newUser._id }, `Failed to send temporary password email: ${err.message}`);
    }

    return { isNewUser: true, user: newUser };
  }

  // ── New user ────────────────────────────────────────────────────────────
  // Generate a 48-hour invite token (reuses Module 1's passwordResetTokenHash fields)
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSha256(plainToken);
  const tokenExpiry = new Date(Date.now() + INVITE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  const newUser = await User.create({
    name,
    email,
    phone,
    role,
    passwordHash: null, // not usable until invite is accepted
    isEmailVerified: false,
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: tokenExpiry,
    companyAccess: [{
      companyId,
      role,
      isActive: true,
      invitedAt: new Date(),
      joinedAt: null
    }]
  });

  try {
    await sendInviteEmail(email, plainToken, companyName);
    newUser.companyAccess[0].inviteSent = true;
    await newUser.save();
  } catch (err) {
    const pino = require('pino');
    const logger = pino();
    logger.error({ userId: newUser._id }, `Failed to send invite email: ${err.message}`);
  }

  return { isNewUser: true, user: newUser, inviteToken: plainToken };
};

module.exports = {
  inviteUser,
  toCompanyUserView,
  wouldSelfLockout,
  INVITE_TOKEN_EXPIRY_HOURS
};
