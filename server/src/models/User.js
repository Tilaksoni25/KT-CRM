const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true },
  userAgent: String,
  ip: String,
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false }
}, { _id: true }); // _id:true so each session gets a unique ObjectId used as sessionId

const otpSchema = new mongoose.Schema({
  codeHash: { type: String },
  purpose: { type: String, enum: ['login', '2fa_setup'] },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true },
  role: { type: String, default: 'user' },
  isEmailVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLoginAt: { type: Date },
  refreshTokens: {
    type: [refreshTokenSchema],
    select: false
  },
  otp: {
    type: otpSchema,
    select: false
  },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerificationTokenHash: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null }
}, {
  timestamps: true
});

// Virtual method to check if user is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save hook or helper functions can also be defined, but let's keep logic in controllers/services for clarity.

const User = mongoose.model('User', userSchema);

module.exports = User;
