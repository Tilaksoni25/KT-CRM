const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const userController = require('../controllers/user.controller');

/**
 * All 4 endpoints are gated by:
 *  1. authenticate  — valid JWT required
 *  2. requirePermission('UserManagement', 'manage')
 *     — caller must have at least "manage" on UserManagement in Module 23's permission matrix.
 *     — company owners bypass this check automatically (see requirePermission.js).
 *
 * When Module 16 is updated to store roleId (ObjectId ref to Role),
 * update requirePermission.js step 3 to look up by _id instead of name string.
 */

// POST /api/user — Invite / add a user to a company
router.post(
  '/',
  authenticate,
  requirePermission('UserManagement', 'manage'),
  userController.inviteUser
);

// GET /api/user?companyId= — List users for a company
router.get(
  '/',
  authenticate,
  requirePermission('UserManagement', 'manage'),
  userController.listUsers
);

// PUT /api/user/:id — Update role, status, or profile
router.put(
  '/:id',
  authenticate,
  requirePermission('UserManagement', 'manage'),
  userController.updateUser
);

// DELETE /api/user/:id?companyId= — Revoke company access
router.delete(
  '/:id',
  authenticate,
  requirePermission('UserManagement', 'manage'),
  userController.revokeAccess
);

module.exports = router;
