const Role = require('../models/Role');
const { PERMISSION_MODULES, PERMISSION_LEVELS } = require('../models/Role');

// ─────────────────────────────────────────────────────────────────────────────
// Default Role Permission Templates
// Exported as a plain data structure so it can be reviewed / adjusted without
// touching controller logic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RoleTemplate
 * @property {string}  name
 * @property {string}  description
 * @property {boolean} isSystemRole
 * @property {boolean} isProtected   — only Super Admin
 * @property {Object}  perms         — keyed by module name, value is a level string
 */

/** @type {RoleTemplate[]} */
const DEFAULT_ROLE_TEMPLATES = [
  {
    name: 'Super Admin',
    description: 'Unrestricted access to all modules. Permissions cannot be edited.',
    isSystemRole: true,
    isProtected: true,
    perms: {
      CompanySettings: 'full', UserManagement: 'full', MasterData: 'full',
      EmployeeDepartment: 'full', Accounting: 'full', Banking: 'full',
      CRM: 'full', Purchase: 'full', Inventory: 'full', ExpenseSalary: 'full',
      FixedAssets: 'full', Reports: 'full', Approvals: 'full',
      AuditLog: 'full', NotificationConfig: 'full'
    }
  },
  {
    name: 'Admin',
    description: 'Company administrator with broad access but not Super Admin-level.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'manage', UserManagement: 'manage', MasterData: 'full',
      EmployeeDepartment: 'full', Accounting: 'full', Banking: 'full',
      CRM: 'full', Purchase: 'full', Inventory: 'full', ExpenseSalary: 'full',
      FixedAssets: 'full', Reports: 'full', Approvals: 'full',
      AuditLog: 'view', NotificationConfig: 'manage'
    }
  },
  {
    name: 'Accountant',
    description: 'Handles day-to-day accounting entries and financial reporting.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'view', UserManagement: 'none', MasterData: 'manage',
      EmployeeDepartment: 'view', Accounting: 'entry', Banking: 'full',
      CRM: 'entry', Purchase: 'entry', Inventory: 'view', ExpenseSalary: 'entry',
      FixedAssets: 'entry', Reports: 'full', Approvals: 'entry',
      AuditLog: 'own', NotificationConfig: 'view'
    }
  },
  {
    name: 'CA',
    description: 'Chartered Accountant — read-only with full audit and reporting access.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'view', UserManagement: 'none', MasterData: 'view',
      EmployeeDepartment: 'none', Accounting: 'view', Banking: 'view',
      CRM: 'none', Purchase: 'view', Inventory: 'none', ExpenseSalary: 'view',
      FixedAssets: 'view', Reports: 'full', Approvals: 'none',
      AuditLog: 'full', NotificationConfig: 'view'
    }
  },
  {
    name: 'Manager',
    description: 'Mid-level manager with approval rights over key workflows.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'view', UserManagement: 'none', MasterData: 'view',
      EmployeeDepartment: 'view', Accounting: 'view', Banking: 'view',
      CRM: 'approve', Purchase: 'approve', Inventory: 'view', ExpenseSalary: 'approve',
      FixedAssets: 'view', Reports: 'view', Approvals: 'approve',
      AuditLog: 'view', NotificationConfig: 'view'
    }
  },
  {
    name: 'Sales',
    description: 'Sales team member with CRM and limited inventory/expense access.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'none', UserManagement: 'none', MasterData: 'manage',
      EmployeeDepartment: 'none', Accounting: 'none', Banking: 'none',
      CRM: 'full', Purchase: 'none', Inventory: 'view', ExpenseSalary: 'own',
      FixedAssets: 'none', Reports: 'view', Approvals: 'entry',
      AuditLog: 'none', NotificationConfig: 'none'
    }
  },
  {
    name: 'HR',
    description: 'Human resources with access to employee/department and payroll modules.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'none', UserManagement: 'none', MasterData: 'none',
      EmployeeDepartment: 'full', Accounting: 'none', Banking: 'none',
      CRM: 'none', Purchase: 'none', Inventory: 'none', ExpenseSalary: 'full',
      FixedAssets: 'none', Reports: 'view', Approvals: 'entry',
      AuditLog: 'none', NotificationConfig: 'none'
    }
  },
  {
    name: 'Employee',
    description: 'Standard employee with access only to their own records.',
    isSystemRole: true,
    isProtected: false,
    perms: {
      CompanySettings: 'none', UserManagement: 'none', MasterData: 'none',
      EmployeeDepartment: 'own', Accounting: 'none', Banking: 'none',
      CRM: 'none', Purchase: 'none', Inventory: 'none', ExpenseSalary: 'own',
      FixedAssets: 'none', Reports: 'none', Approvals: 'entry',
      AuditLog: 'none', NotificationConfig: 'none'
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete 15-entry permissions array from a partial input array.
 * Modules not present in input default to level "none".
 * @param {Array<{module: string, level: string}>} inputPermissions
 * @returns {Array<{module: string, level: string}>}
 */
const buildCompletePermissions = (inputPermissions = []) => {
  const inputMap = {};
  for (const entry of inputPermissions) {
    inputMap[entry.module] = entry.level;
  }
  return PERMISSION_MODULES.map((mod) => ({
    module: mod,
    level: inputMap[mod] !== undefined ? inputMap[mod] : 'none'
  }));
};

/**
 * Merge submitted permission entries into an existing 15-entry permissions array.
 * Only modules included in the patch change; unmentioned modules keep their current level.
 * @param {Array<{module: string, level: string}>} existingPermissions
 * @param {Array<{module: string, level: string}>} patch
 * @returns {Array<{module: string, level: string}>}
 */
const mergePermissions = (existingPermissions, patch) => {
  const patchMap = {};
  for (const entry of patch) {
    patchMap[entry.module] = entry.level;
  }
  return existingPermissions.map((entry) => ({
    module: entry.module,
    level: patchMap[entry.module] !== undefined ? patchMap[entry.module] : entry.level
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Business logic functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if any users are assigned to this role.
 * Currently returns false as a placeholder.
 * TODO: check User.companyAccess[].roleId once Module 16 (User Management) exists.
 * @param {string} roleId
 * @returns {Promise<boolean>}
 */
const hasUsersAssigned = async (roleId) => {
  // TODO: once Module 16 exists — const count = await User.countDocuments({ 'companyAccess.roleId': roleId });
  // return count > 0;
  return false;
};

/**
 * Seed the 8 default system roles for a given company.
 * Idempotent: throws 409 if any isSystemRole already exists for this company.
 * Mirrors the pattern of seedDefaultCoa() in coa.service.js.
 *
 * @param {string} companyId
 * @returns {Promise<{ count: number, ids: string[] }>}
 */
const seedDefaultRoles = async (companyId) => {
  // Idempotency guard
  const existing = await Role.findOne({ companyId, isSystemRole: true });
  if (existing) {
    const err = new Error('Default roles already seeded for this company');
    err.statusCode = 409;
    throw err;
  }

  const seededIds = [];

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const permissions = buildCompletePermissions(
      Object.entries(template.perms).map(([module, level]) => ({ module, level }))
    );

    const role = await Role.create({
      companyId,
      name: template.name,
      description: template.description,
      isSystemRole: template.isSystemRole,
      isProtected: template.isProtected,
      permissions
    });

    seededIds.push(role._id.toString());
  }

  return { count: seededIds.length, ids: seededIds };
};

module.exports = {
  DEFAULT_ROLE_TEMPLATES,
  PERMISSION_MODULES,
  PERMISSION_LEVELS,
  buildCompletePermissions,
  mergePermissions,
  hasUsersAssigned,
  seedDefaultRoles
};
