const User = require('../models/User');
const Company = require('../models/Company');
const userService = require('../services/user.service');
const { inviteUserSchema, updateUserSchema } = require('../validators/user.validators');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user — Invite / add a user to a company
// ─────────────────────────────────────────────────────────────────────────────

const inviteUser = async (req, res, next) => {
  try {
    const parsed = inviteUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId, name, email, phone, role } = parsed.data;

    // Fetch company name for the invite email subject
    const company = await Company.findById(companyId).select('name');
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
        errorCode: 'COMPANY_NOT_FOUND'
      });
    }

    let result;
    try {
      result = await userService.inviteUser({ companyId, name, email, phone, role, companyName: company.name });
    } catch (err) {
      if (err.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: err.message,
          errorCode: err.errorCode
        });
      }
      throw err;
    }

    const { isNewUser, user } = result;
    return res.status(isNewUser ? 201 : 200).json({
      success: true,
      message: isNewUser
        ? 'User invited successfully. An invite email has been sent.'
        : 'Existing user granted access to this company.',
      data: {
        userId: user._id,
        email: user.email,
        companyId,
        role
      }
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user?companyId= — List users with access to a company
// ─────────────────────────────────────────────────────────────────────────────

const listUsers = async (req, res, next) => {
  try {
    const { companyId, search, includeInactive } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId query parameter is required',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    // Base query: users who have a companyAccess entry for this company
    const matchActive = includeInactive === 'true'
      ? { 'companyAccess.companyId': companyId }
      : { 'companyAccess.companyId': companyId, 'companyAccess.isActive': true };

    // Optional name/email search
    let searchFilter = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      searchFilter = { $or: [{ name: regex }, { email: regex }] };
    }

    const filter = { ...matchActive, ...searchFilter };

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = users.map((u) => userService.toCompanyUserView(u, companyId));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user/:id — Update role / active status / profile fields
// ─────────────────────────────────────────────────────────────────────────────

const updateUser = async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId, role, isActive, name, phone } = parsed.data;
    const targetUserId = req.params.id;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    // Find the companyAccess entry for this company
    const accessEntry = targetUser.companyAccess.find(
      (a) => a.companyId.toString() === companyId.toString()
    );
    if (!accessEntry) {
      return res.status(404).json({
        success: false,
        message: 'This user does not have access to the specified company',
        errorCode: 'ACCESS_ENTRY_NOT_FOUND'
      });
    }

    // Self-lockout guard
    if (isActive === false) {
      const callerUser = await User.findById(req.user._id);
      if (userService.wouldSelfLockout(callerUser, targetUserId, companyId)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own only remaining company access',
          errorCode: 'SELF_LOCKOUT_PREVENTED'
        });
      }
    }

    // Apply companyAccess-scoped changes
    if (role !== undefined) accessEntry.role = role;
    if (isActive !== undefined) accessEntry.isActive = isActive;

    // Apply global profile changes
    if (name !== undefined) targetUser.name = name;
    if (phone !== undefined) targetUser.phone = phone;

    await targetUser.save();

    return res.status(200).json({
      success: true,
      data: userService.toCompanyUserView(targetUser, companyId)
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user/:id?companyId= — Revoke a user's access to a company
// ─────────────────────────────────────────────────────────────────────────────

const revokeAccess = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const targetUserId = req.params.id;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId query parameter is required',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    const accessEntry = targetUser.companyAccess.find(
      (a) => a.companyId.toString() === companyId.toString()
    );
    if (!accessEntry) {
      return res.status(404).json({
        success: false,
        message: 'This user does not have access to the specified company',
        errorCode: 'ACCESS_ENTRY_NOT_FOUND'
      });
    }

    // Self-lockout guard
    const callerUser = await User.findById(req.user._id);
    if (userService.wouldSelfLockout(callerUser, targetUserId, companyId)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own only remaining company access',
        errorCode: 'SELF_LOCKOUT_PREVENTED'
      });
    }

    // Soft revoke — preserve the user and their history
    accessEntry.isActive = false;
    await targetUser.save();

    return res.status(200).json({
      success: true,
      message: 'User access revoked for this company'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  inviteUser,
  listUsers,
  updateUser,
  revokeAccess
};
