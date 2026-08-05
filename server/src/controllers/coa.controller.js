const ChartOfAccount = require('../models/ChartOfAccount');
const { getAccountBalance, hasTransactions, generateNextCode, seedDefaultCoa } = require('../services/coa.service');

/**
 * POST /api/coa
 * Create a custom account
 */
const createAccount = async (req, res, next) => {
  try {
    const { companyId, name, type, isGroup, parentId, code, openingBalance, openingBalanceType } = req.body;

    // Validate parentId if provided
    let resolvedParentId = null;
    if (parentId) {
      const parentAcc = await ChartOfAccount.findById(parentId);
      if (!parentAcc) {
        return res.status(400).json({
          success: false,
          message: 'Parent account not found'
        });
      }
      if (parentAcc.companyId.toString() !== companyId) {
        return res.status(400).json({
          success: false,
          message: 'Parent account does not belong to the same company'
        });
      }
      if (!parentAcc.isGroup) {
        return res.status(400).json({
          success: false,
          message: 'Parent account must be a group account (isGroup: true)'
        });
      }
      if (parentAcc.type !== type) {
        return res.status(400).json({
          success: false,
          message: `Parent account type (${parentAcc.type}) does not match child type (${type})`
        });
      }
      resolvedParentId = parentAcc._id;
    }

    // Auto-generate code if omitted
    let finalCode = code;
    if (!finalCode) {
      finalCode = await generateNextCode(companyId, type);
    } else {
      // Check if code is already in use by another account in the same company
      const codeExists = await ChartOfAccount.findOne({ companyId, code: finalCode });
      if (codeExists) {
        return res.status(400).json({
          success: false,
          message: `Code ${finalCode} is already in use by another account in this company`
        });
      }
    }

    const account = await ChartOfAccount.create({
      companyId,
      name,
      type,
      isGroup,
      parentId: resolvedParentId,
      code: finalCode,
      openingBalance,
      openingBalanceType,
      isSystemAccount: false,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      data: account
    });
  } catch (error) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Account code already exists within this company',
        errorCode: 'DUPLICATE_CODE'
      });
    }
    next(error);
  }
};

/**
 * GET /api/coa
 * List accounts for a company (flat or tree)
 */
const listAccounts = async (req, res, next) => {
  try {
    const { companyId, type, asTree, includeInactive } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID query parameter is required'
      });
    }

    const filter = { companyId };
    if (type) {
      filter.type = type;
    }
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const accounts = await ChartOfAccount.find(filter).lean().sort({ code: 1 });

    if (asTree === 'true') {
      const tree = buildTree(accounts);
      return res.status(200).json({
        success: true,
        data: tree
      });
    }

    return res.status(200).json({
      success: true,
      data: accounts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to build recursive tree structure from a flat array of accounts
 */
const buildTree = (accounts) => {
  const map = {};
  const roots = [];

  // Initialize mapping and create children array placeholder on groups
  accounts.forEach(acc => {
    map[acc._id.toString()] = { ...acc };
    if (acc.isGroup) {
      map[acc._id.toString()].children = [];
    }
  });

  // Construct hierarchy
  accounts.forEach(acc => {
    const mappedAcc = map[acc._id.toString()];
    if (acc.parentId) {
      const parent = map[acc.parentId.toString()];
      if (parent && parent.children) {
        parent.children.push(mappedAcc);
      } else {
        roots.push(mappedAcc);
      }
    } else {
      roots.push(mappedAcc);
    }
  });

  return roots;
};

/**
 * GET /api/coa/:id
 * Retrieve details for a specific account
 */
const getAccountDetails = async (req, res, next) => {
  try {
    // req.coa is already loaded by the checkCompanyAccess middleware
    const balance = await getAccountBalance(req.coa._id);

    const data = {
      ...req.coa.toObject(),
      currentBalance: balance
    };

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/coa/:id
 * Update account details
 */
const updateAccount = async (req, res, next) => {
  try {
    const account = req.coa; // loaded by middleware
    const updates = req.body;

    // Reject changes to type or isGroup
    if ('type' in updates || 'isGroup' in updates) {
      return res.status(400).json({
        success: false,
        message: 'type and isGroup cannot be changed after creation; create a new account instead'
      });
    }

    // Reject modifications to name, code, or parentId for system accounts
    if (account.isSystemAccount) {
      const isChangingName = updates.name !== undefined && updates.name !== account.name;
      const isChangingCode = updates.code !== undefined && updates.code !== account.code;
      const isChangingParent = updates.parentId !== undefined && String(updates.parentId || '') !== String(account.parentId || '');

      if (isChangingName || isChangingCode || isChangingParent) {
        return res.status(403).json({
          success: false,
          message: 'default accounts cannot be deleted or renamed'
        });
      }
    }

    // Validate parentId if being changed
    if (updates.parentId !== undefined && String(updates.parentId || '') !== String(account.parentId || '')) {
      if (updates.parentId) {
        // Prevent circular parenting
        if (updates.parentId.toString() === account._id.toString()) {
          return res.status(400).json({
            success: false,
            message: 'An account cannot be its own parent'
          });
        }

        const parentAcc = await ChartOfAccount.findById(updates.parentId);
        if (!parentAcc) {
          return res.status(400).json({
            success: false,
            message: 'Parent account not found'
          });
        }
        if (parentAcc.companyId.toString() !== account.companyId.toString()) {
          return res.status(400).json({
            success: false,
            message: 'Parent account does not belong to the same company'
          });
        }
        if (!parentAcc.isGroup) {
          return res.status(400).json({
            success: false,
            message: 'Parent account must be a group account (isGroup: true)'
          });
        }
        if (parentAcc.type !== account.type) {
          return res.status(400).json({
            success: false,
            message: `Parent account type (${parentAcc.type}) does not match account type (${account.type})`
          });
        }

        // Deep circular checks
        if (account.isGroup) {
          let currParentId = parentAcc.parentId;
          while (currParentId) {
            if (currParentId.toString() === account._id.toString()) {
              return res.status(400).json({
                success: false,
                message: 'Circular parent relationship detected'
              });
            }
            const ancestor = await ChartOfAccount.findById(currParentId);
            if (!ancestor) break;
            currParentId = ancestor.parentId;
          }
        }

        account.parentId = parentAcc._id;
      } else {
        account.parentId = null;
      }
    }

    // Check code uniqueness if being updated
    if (updates.code !== undefined && updates.code !== account.code) {
      const codeExists = await ChartOfAccount.findOne({
        companyId: account.companyId,
        code: updates.code,
        _id: { $ne: account._id }
      });
      if (codeExists) {
        return res.status(400).json({
          success: false,
          message: `Code ${updates.code} is already in use by another account in this company`
        });
      }
      account.code = updates.code;
    }

    if (updates.name !== undefined) account.name = updates.name;
    if (updates.isActive !== undefined) account.isActive = updates.isActive;

    const saved = await account.save();

    return res.status(200).json({
      success: true,
      data: saved
    });
  } catch (error) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Account code already exists within this company',
        errorCode: 'DUPLICATE_CODE'
      });
    }
    next(error);
  }
};

/**
 * DELETE /api/coa/:id
 * Delete a custom account
 */
const deleteAccount = async (req, res, next) => {
  try {
    const account = req.coa; // loaded by middleware

    // Reject if system account
    if (account.isSystemAccount) {
      return res.status(403).json({
        success: false,
        message: 'default accounts cannot be deleted'
      });
    }

    // Reject if group with children
    if (account.isGroup) {
      const childExists = await ChartOfAccount.findOne({
        companyId: account.companyId,
        parentId: account._id
      });
      if (childExists) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete group account with child accounts'
        });
      }
    }

    // Reject if has transactions
    const used = await hasTransactions(account._id);
    if (used) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete account with transactions'
      });
    }

    // Soft delete to maintain historical integrity of the ledger hierarchy
    account.isActive = false;
    await account.save();

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/coa/seed-default
 * Seed default accounts
 */
const seedDefaultCoaRoute = async (req, res, next) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const count = await seedDefaultCoa(companyId);

    return res.status(201).json({
      success: true,
      data: {
        count
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

module.exports = {
  createAccount,
  listAccounts,
  getAccountDetails,
  updateAccount,
  deleteAccount,
  seedDefaultCoaRoute
};
