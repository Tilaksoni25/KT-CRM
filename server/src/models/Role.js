const mongoose = require('mongoose');

const PERMISSION_MODULES = [
  'CompanySettings',
  'UserManagement',
  'MasterData',
  'EmployeeDepartment',
  'Accounting',
  'Banking',
  'CRM',
  'Purchase',
  'Inventory',
  'ExpenseSalary',
  'FixedAssets',
  'Reports',
  'Approvals',
  'AuditLog',
  'NotificationConfig'
];

const PERMISSION_LEVELS = ['full', 'manage', 'entry', 'approve', 'view', 'own', 'none'];

const permissionEntrySchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: PERMISSION_MODULES
    },
    level: {
      type: String,
      required: true,
      enum: PERMISSION_LEVELS
    }
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    isSystemRole: {
      type: Boolean,
      default: false
    },
    /**
     * isProtected = true ONLY for the seeded Super Admin role.
     * A protected role's permissions can never be edited and the role can never be deleted.
     */
    isProtected: {
      type: Boolean,
      default: false
    },
    /**
     * Always stores a complete 15-entry array — one entry per business module.
     * Never a sparse array. Downstream permission checks can always assume all modules exist.
     */
    permissions: {
      type: [permissionEntrySchema],
      required: true,
      validate: {
        validator(arr) {
          return arr.length === PERMISSION_MODULES.length;
        },
        message: `permissions must contain exactly ${PERMISSION_MODULES.length} entries (one per module)`
      }
    }
  },
  { timestamps: true }
);

// Compound unique index — case-insensitive to enforce the business rule at DB level
roleSchema.index(
  { companyId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
module.exports.PERMISSION_MODULES = PERMISSION_MODULES;
module.exports.PERMISSION_LEVELS = PERMISSION_LEVELS;
