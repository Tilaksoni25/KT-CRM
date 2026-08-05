const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const roleController = require('../controllers/role.controller');

/**
 * NOTE — Permission enforcement:
 * Since Module 16 (User Management) does not exist yet, these endpoints are
 * open to any authenticated user that belongs to the target company.
 * Once Module 16 is built, add a permission-gate middleware here that checks
 * the caller's role has at least "manage" on UserManagement before allowing
 * POST /api/role, PUT .../permissions, and DELETE /api/role/:id.
 */

// POST /api/role/seed-default — MUST be registered BEFORE /:id routes to avoid
// the literal string "seed-default" being mistaken for a MongoDB ObjectId.
router.post(
  '/seed-default',
  authenticate,
  checkCompanyAccess,
  roleController.seedDefault
);

// POST /api/role — Create a custom role
router.post(
  '/',
  authenticate,
  checkCompanyAccess,
  roleController.createRole
);

// GET /api/role?companyId= — List all roles for a company
router.get(
  '/',
  authenticate,
  checkCompanyAccess,
  roleController.listRoles
);

// PUT /api/role/:id/permissions — Merge-update a role's permission matrix
router.put(
  '/:id/permissions',
  authenticate,
  checkCompanyAccess,
  roleController.updatePermissions
);

// DELETE /api/role/:id — Delete a custom (non-system) role
router.delete(
  '/:id',
  authenticate,
  checkCompanyAccess,
  roleController.deleteRole
);

module.exports = router;
