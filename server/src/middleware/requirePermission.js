const Role = require('../models/Role');
const Company = require('../models/Company');

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
      // 1. Try request body/query first
      let companyId =
        req.body?.companyId ||
        req.query?.companyId ||
        req.company?._id;

      // 2. If not found, take it from logged in user
      if (!companyId && req.user?.companyId) {
        companyId = req.user.companyId;
      }

      // 3. If still not found, use first active companyAccess
      if (
        !companyId &&
        req.user?.companyAccess &&
        req.user.companyAccess.length > 0
      ) {
        const activeCompany = req.user.companyAccess.find(c => c.isActive);

        if (activeCompany) {
          companyId = activeCompany.companyId;
        }
      }

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'Company ID not found',
          errorCode: 'COMPANY_ID_REQUIRED'
        });
      }

      companyId = companyId.toString();

      // Save for controllers
      req.companyId = companyId;

      const accessEntry = (req.user.companyAccess || []).find(
        access =>
          access.companyId.toString() === companyId &&
          access.isActive
      );

      const company = await Company.findById(companyId).select('createdBy');

      const isOwner =
        company &&
        company.createdBy.toString() === req.user._id.toString();

      if (!accessEntry && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this company',
          errorCode: 'FORBIDDEN'
        });
      }

      if (isOwner) {
        return next();
      }

      const roleDoc = await Role.findOne({
        companyId,
        name: new RegExp(`^${accessEntry.role}$`, 'i')
      });

      if (!roleDoc) {
        return res.status(403).json({
          success: false,
          message: `Role "${accessEntry.role}" not found`,
          errorCode: 'ROLE_NOT_FOUND'
        });
      }

      const permission = roleDoc.permissions.find(
        p => p.module === moduleName
      );

      if (!permission) {
        return res.status(403).json({
          success: false,
          message: `Permission not found for "${moduleName}"`,
          errorCode: 'PERMISSION_NOT_FOUND'
        });
      }

      if (!meetsLevel(permission.level, requiredLevel)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permission',
          errorCode: 'INSUFFICIENT_PERMISSION'
        });
      }

      req.callerRole = roleDoc;
      req.callerPermissionLevel = permission.level;

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = requirePermission;