const Role = require('../models/Role');
const { PERMISSION_MODULES } = require('../models/Role');
const roleService = require('../services/role.service');
const {
  createRoleSchema,
  updatePermissionsSchema,
  seedDefaultSchema
} = require('../validators/role.validators');

// ─────────────────────────────────────────────────────────────────────────────
// Sorting helpers
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_ROLE_ORDER = [
  'Super Admin', 'Admin', 'Accountant', 'CA', 'Manager', 'Sales', 'HR', 'Employee'
];

/**
 * Sort comparator: system roles first (in the spec-defined order), then custom roles alphabetically.
 */
const rolesSortComparator = (a, b) => {
  const aIdx = SYSTEM_ROLE_ORDER.indexOf(a.name);
  const bIdx = SYSTEM_ROLE_ORDER.indexOf(b.name);
  if (a.isSystemRole && b.isSystemRole) {
    return aIdx - bIdx;
  }
  if (a.isSystemRole) return -1;
  if (b.isSystemRole) return 1;
  return a.name.localeCompare(b.name);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/role
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new custom role.
 * - Fills missing modules with level "none"
 * - Rejects duplicate name (case-insensitive) per company
 */
const createRole = async (req, res, next) => {
  try {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId, name, description, permissions: inputPermissions } = parsed.data;

    // Duplicate name check (case-insensitive)
    const existing = await Role.findOne({ companyId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A role named "${name}" already exists for this company`,
        errorCode: 'ROLE_NAME_CONFLICT'
      });
    }

    const permissions = roleService.buildCompletePermissions(inputPermissions);

    const role = await Role.create({
      companyId,
      name,
      description,
      isSystemRole: false,
      isProtected: false,
      permissions
    });

    return res.status(201).json({ success: true, data: role });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/role?companyId=
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all roles (system + custom) for the company.
 * System roles returned first in spec order, then custom roles alphabetically.
 */
const listRoles = async (req, res, next) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId query parameter is required',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    const roles = await Role.find({ companyId });
    roles.sort(rolesSortComparator);

    return res.status(200).json({
      success: true,
      data: roles,
      total: roles.length
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/role/:id/permissions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update a role's permission matrix.
 * - 403 if isProtected (Super Admin only)
 * - Merges submitted entries; unmentioned modules keep their current level
 */
const updatePermissions = async (req, res, next) => {
  try {
    const role = req.role; // cached by checkCompanyAccess

    if (role.isProtected) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin role permissions are protected and cannot be edited',
        errorCode: 'ROLE_PROTECTED'
      });
    }

    const parsed = updatePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const mergedPermissions = roleService.mergePermissions(role.permissions, parsed.data.permissions);
    role.permissions = mergedPermissions;
    await role.save();

    return res.status(200).json({ success: true, data: role });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/role/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete a custom role.
 * - 403 if isSystemRole (system roles are undeleteable)
 * - 409 if any users are assigned (placeholder check via hasUsersAssigned)
 * - Hard delete for custom unused roles
 */
const deleteRole = async (req, res, next) => {
  try {
    const role = req.role; // cached by checkCompanyAccess

    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be deleted',
        errorCode: 'SYSTEM_ROLE_PROTECTED'
      });
    }

    const inUse = await roleService.hasUsersAssigned(role._id);
    if (inUse) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a role that is currently assigned to users',
        errorCode: 'ROLE_IN_USE'
      });
    }

    await role.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/role/seed-default
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed the 8 default system roles for a company.
 * Idempotent — returns 409 if already seeded.
 */
const seedDefault = async (req, res, next) => {
  try {
    const parsed = seedDefaultSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId } = parsed.data;

    const result = await roleService.seedDefaultRoles(companyId);

    return res.status(201).json({
      success: true,
      message: `${result.count} default roles seeded successfully`,
      data: result
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
        errorCode: 'ROLES_ALREADY_SEEDED'
      });
    }
    next(error);
  }
};

module.exports = {
  createRole,
  listRoles,
  updatePermissions,
  deleteRole,
  seedDefault
};
