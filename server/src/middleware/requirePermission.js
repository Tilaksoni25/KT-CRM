const Role = require('../models/Role');

/**
 * Express middleware factory: requires the authenticated caller to have at least
 * the given permission level on the specified business module (via Module 23's Role matrix).
 *
 * Permission level hierarchy (ascending privilege):
 *   none < own < view < entry < approve < manage < full
 *
 * Usage:
 *   router.post('/', authenticate, requirePermission('UserManagement', 'manage'), controller)
 *
 * How it resolves the caller's role:
 *   1. Reads `companyId` from req.body or req.query.
 *   2. Finds the matching companyAccess entry for that companyId on req.user.
 *   3. Looks up the Role document by the role name (free-form string, Module 23 seeded).
 *   4. Checks if the role's permission level for the module meets the required level.
 *
 * NOTE: This works with free-form role name strings (e.g. "Admin", "Accountant") matching
 * the DEFAULT_ROLE_TEMPLATES seeded in Module 23's role.service.js.
 * When Module 16's companyAccess is updated to store a roleId (ObjectId ref to Role),
 * update step 3 to look up by _id instead of name.
 *
 * @param {string} moduleName   - one of the 15 business module keys from Module 23
 * @param {string} requiredLevel - minimum required level ('manage', 'view', etc.)
 */

const LEVEL_ORDER = ['none', 'own', 'view', 'entry', 'approve', 'manage', 'full'];

const meetsLevel = (actual, required) => {
  const actualIdx = LEVEL_ORDER.indexOf(actual);
  const requiredIdx = LEVEL_ORDER.indexOf(required);
  if (actualIdx === -1 || requiredIdx === -1) return false;
  return actualIdx >= requiredIdx;
};

const requirePermission = (moduleName, requiredLevel) => {
  return async (req, res, next) => {
    try {
      // Determine the companyId from the request (body for POST/PUT, query for GET/DELETE)
      const companyId =
        req.body?.companyId ||
        req.query?.companyId ||
        req.company?._id?.toString();

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'companyId is required to verify permissions',
          errorCode: 'COMPANY_ID_REQUIRED'
        });
      }

      // Find caller's companyAccess entry for this company
      const accessEntry = (req.user.companyAccess || []).find(
        (a) => a.companyId.toString() === companyId.toString() && a.isActive
      );

      // Allow the company owner (the user who created the company) to bypass the role check.
      // The owner may not have a companyAccess entry if they haven't been explicitly invited
      // to their own company yet (i.e. before Module 16 existed).
      const Company = require('../models/Company');
      const company = await Company.findById(companyId).select('createdBy');
      const isOwner = company && company.createdBy.toString() === req.user._id.toString();

      if (!accessEntry && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this company',
          errorCode: 'FORBIDDEN'
        });
      }

      // Owners are treated as Super Admin — bypass further checks
      if (isOwner && !accessEntry) {
        return next();
      }

      // Look up the Role document by name for this company
      const roleName = accessEntry.role;
      const roleDoc = await Role.findOne({ companyId, name: new RegExp(`^${roleName}$`, 'i') });

      if (!roleDoc) {
        // Role name doesn't match any seeded/custom role — deny access
        return res.status(403).json({
          success: false,
          message: `Unrecognised role "${roleName}" — please contact your company administrator`,
          errorCode: 'ROLE_NOT_FOUND'
        });
      }

      // Find the permission entry for the requested module
      const permEntry = roleDoc.permissions.find((p) => p.module === moduleName);
      if (!permEntry) {
        return res.status(403).json({
          success: false,
          message: `No permission entry found for module "${moduleName}"`,
          errorCode: 'PERMISSION_NOT_FOUND'
        });
      }

      if (!meetsLevel(permEntry.level, requiredLevel)) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions: "${moduleName}" requires at least "${requiredLevel}" level. Your current level is "${permEntry.level}".`,
          errorCode: 'INSUFFICIENT_PERMISSION'
        });
      }

      // Attach resolved role info for downstream use
      req.callerRole = roleDoc;
      req.callerPermissionLevel = permEntry.level;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = requirePermission;
