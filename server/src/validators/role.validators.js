const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

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

const permissionEntrySchema = z.object({
  module: z.enum(PERMISSION_MODULES, {
    errorMap: () => ({
      message: `module must be one of: ${PERMISSION_MODULES.join(', ')}`
    })
  }),
  level: z.enum(PERMISSION_LEVELS, {
    errorMap: () => ({
      message: `level must be one of: ${PERMISSION_LEVELS.join(', ')}`
    })
  })
});

const createRoleSchema = z.object({
  companyId: z
    .string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format'),
  name: z
    .string({ required_error: 'Role name is required' })
    .trim()
    .min(1, 'Role name cannot be empty'),
  description: z.string().trim().optional().default(''),
  permissions: z.array(permissionEntrySchema).optional().default([])
}).strict();

/**
 * Used for PUT /api/role/:id/permissions
 * Only accepts a permissions array — company/name are not patchable via this endpoint.
 */
const updatePermissionsSchema = z.object({
  permissions: z
    .array(permissionEntrySchema, { required_error: 'permissions array is required' })
    .min(1, 'permissions array must contain at least one entry')
}).strict();

const seedDefaultSchema = z.object({
  companyId: z
    .string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format')
}).strict();

module.exports = {
  createRoleSchema,
  updatePermissionsSchema,
  seedDefaultSchema,
  PERMISSION_MODULES,
  PERMISSION_LEVELS
};
