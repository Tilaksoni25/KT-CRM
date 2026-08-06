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

/**
 * companyAccess sub-document.
 * A single User can belong to multiple companies with different roles.
 * Module 16 reads/writes role via this array — not the flat top-level `role` field.
 * The top-level `role` field is kept for backward-compat with Module 1's auth bootstrapping only.
 */
const companyAccessSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    /**
     * Free-form role string for now.
     * Module 23 formalizes this into a real Role._id reference.
     * When Module 23 is wired up, add: roleId: { type: ObjectId, ref: 'Role' }
     * and populate via companyAccess[].roleId to get the full permission matrix.
     */
    role: {
      type: String,
      required: true,
      default: 'employee'
    },
    isActive: { type: Boolean, default: true },
    invitedAt: { type: Date },
    /**
     * Set to now() the first time this user completes password setup after being invited.
     * Updated inside Module 1's reset-password handler once the user successfully
     * sets their password via the invite link.
     */
    joinedAt: { type: Date, default: null }
  },
  { _id: true }
);

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
  /**
   * passwordHash is null for invited users who haven't completed the password-setup flow yet.
   * Never call bcrypt.compare() against a null hash — Module 1's login guards against this.
   */
  passwordHash: { type: String, default: null, select: false },
  phone: { type: String, trim: true },
  /**
   * Legacy flat role field — used only for Module 1's auth bootstrapping (JWT payload, /me response).
   * Module 16 and onward always reads/writes role via companyAccess[].role.
   */
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
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },

  // Onboarding progress for the user's active company setup. These flags are also
  // calculated from persisted company data during login so existing users work
  // without a migration.
  companyCreated: { type: Boolean, default: false },
  branchCreated: { type: Boolean, default: false },
  financialYearCreated: { type: Boolean, default: false },

  // ── Module 16 addition ──────────────────────────────────────────────────
  companyAccess: {
    type: [companyAccessSchema],
    default: []
  }
}, {
  timestamps: true
});

// Index on companyAccess.companyId for efficient GET /api/user?companyId= queries
userSchema.index({ 'companyAccess.companyId': 1 });

// Virtual method to check if user is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Ensure `companyCreated` flag matches presence of `companyId` on every save.
// This keeps the flag in-sync even if `companyId` is set/cleared elsewhere.
userSchema.pre('save', function(next) {
  try {
    const flag = !!this.companyId;
    this.companyCreated = flag;
    this.branchCreated = flag;
    this.financialYearCreated = flag;
  } catch (err) {
    return next(err);
  }
  next();
});

// Keep `companyCreated` in-sync for update queries that bypass `save()` (e.g. findByIdAndUpdate).
function syncCompanyCreatedInUpdate(next) {
  const update = this.getUpdate && this.getUpdate();
  if (!update) return next();

  // Support both top-level updates and $set updates
  const target = update.$set ? update.$set : update;

  if (Object.prototype.hasOwnProperty.call(target, 'companyId')) {
    const val = target.companyId;
    const bool = !!val;
    if (update.$set) {
      update.$set.companyCreated = bool;
      update.$set.branchCreated = bool;
      update.$set.financialYearCreated = bool;
    } else {
      update.companyCreated = bool;
      update.branchCreated = bool;
      update.financialYearCreated = bool;
    }
    this.setUpdate(update);
  }

  next();
}

userSchema.pre('findOneAndUpdate', syncCompanyCreatedInUpdate);
userSchema.pre('updateOne', syncCompanyCreatedInUpdate);
userSchema.pre('updateMany', syncCompanyCreatedInUpdate);

// Pre-save hook or helper functions can also be defined, but let's keep logic in controllers/services for clarity.

const User = mongoose.model('User', userSchema);

module.exports = User;
