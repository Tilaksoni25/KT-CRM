const mongoose = require('mongoose');
const Branch = require('../models/Branch');

/**
 * POST /api/branch
 * Create a new branch for a company
 */
const createBranch = async (req, res, next) => {
  try {
    const { companyId, branchName, address, city, state, pincode, isHeadOffice, status } = req.body;

    // Count existing branches for the company
    const count = await Branch.countDocuments({ companyId });
    
    let shouldBeHeadOffice = isHeadOffice || false;
    
    // First branch must be the head office
    if (count === 0) {
      shouldBeHeadOffice = true;
    }

    // If this branch is to be the Head Office, unset any existing Head Office for this company
    if (shouldBeHeadOffice) {
      await Branch.updateMany({ companyId }, { $set: { isHeadOffice: false } });
    }

    const branch = await Branch.create({
      companyId,
      branchName,
      address,
      city,
      state,
      pincode,
      isHeadOffice: shouldBeHeadOffice,
      status
    });

    return res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/branch?companyId=
 * List all branches of a company
 */
const listBranches = async (req, res, next) => {
  try {
    const { companyId } = req.query;

    const branches = await Branch.find({ companyId });

    return res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/branch/:id
 * Update branch details
 */
const updateBranch = async (req, res, next) => {
  try {
    const updates = req.body;
    const branch = req.branch; // loaded by checkCompanyAccess middleware

    // Business Rule Check: Cannot manually unset Head Office directly
    if (updates.isHeadOffice === false && branch.isHeadOffice) {
      const otherBranchesCount = await Branch.countDocuments({ companyId: branch.companyId, _id: { $ne: branch._id } });
      if (otherBranchesCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'A company must have at least one Head Office. Set another branch as Head Office to transfer the status.',
          errorCode: 'MINIMUM_ONE_HEAD_OFFICE'
        });
      } else {
        // Only branch cannot unset head office
        updates.isHeadOffice = true;
      }
    }

    // If setting this branch as Head Office, unset all other branches for the company
    if (updates.isHeadOffice === true) {
      await Branch.updateMany({ companyId: branch.companyId }, { $set: { isHeadOffice: false } });
    }

    // Update other fields
    const allowedFields = ['branchName', 'address', 'city', 'state', 'pincode', 'isHeadOffice', 'status'];
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        branch[field] = updates[field];
      }
    });

    await branch.save();

    return res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/branch/:id
 * Delete a branch if it has no associated transactions
 */
const deleteBranch = async (req, res, next) => {
  try {
    const branch = req.branch; // loaded by checkCompanyAccess middleware

    // Business Rule Check: Cannot delete the Head Office
    if (branch.isHeadOffice) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the Head Office branch. Transfer Head Office status to another branch first.',
        errorCode: 'CANNOT_DELETE_HEAD_OFFICE'
      });
    }

    // Check for associated transactions using a dynamic lookup
    let hasTransactions = false;
    try {
      if (mongoose.models.Transaction) {
        const Transaction = mongoose.model('Transaction');
        const count = await Transaction.countDocuments({ branchId: branch._id });
        hasTransactions = count > 0;
      }
    } catch (e) {
      // Dynamic lookup fallback if Transaction schema isn't registered yet
    }

    if (hasTransactions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete branch because it has associated transactions',
        errorCode: 'BRANCH_HAS_TRANSACTIONS'
      });
    }

    await Branch.findByIdAndDelete(branch._id);

    return res.status(200).json({
      success: true,
      message: 'Branch removed'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBranch,
  listBranches,
  updateBranch,
  deleteBranch
};
