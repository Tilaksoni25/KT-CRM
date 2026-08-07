const FinancialYear = require('../models/FinancialYear');
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const User = require('../models/User');

/**
 * POST /api/financial-year
 * Create a new Financial Year for a company
 */
const createFinancialYear = async (req, res, next) => {
  const session = await FinancialYear.startSession();
  let transactionStarted = false;

  try {
    try {
      await session.startTransaction();
      await FinancialYear.findOne().session(session);
      transactionStarted = true;
    } catch (startErr) {
      if (!startErr.message.includes('Transaction numbers are only allowed on a replica set member or mongos')) {
        throw startErr;
      }
      transactionStarted = false;
      try {
        await session.abortTransaction();
      } catch (ignore) {
        // Best-effort cleanup when transaction support is unavailable.
      }
    }

    const sessionOpts = transactionStarted ? { session } : {};

    if (!req.user.companyCreated) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Complete company setup first.',
        nextStep: 'CREATE_COMPANY'
      });
    }

    if (!req.user.branchCreated) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Complete branch setup first.',
        nextStep: 'CREATE_BRANCH'
      });
    }

    const { companyId, branchId, startDate, endDate, yearLabel, isLocked, status } = req.body;

    // A branch cannot be associated with another company's financial year.
    const branchQuery = Branch.findOne({ _id: branchId, companyId });
    if (transactionStarted) branchQuery.session(session);
    const branch = await branchQuery;
    if (!branch) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Branch does not belong to the specified company',
        errorCode: 'INVALID_BRANCH_COMPANY'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date',
        errorCode: 'INVALID_DATE_RANGE'
      });
    }

    // Business Rule Check: Check overlap within the same branch.
    const overlap = transactionStarted
      ? await FinancialYear.findOne({
          companyId,
          branchId,
          startDate: { $lte: end },
          endDate: { $gte: start }
        }).session(session)
      : await FinancialYear.findOne({
          companyId,
          branchId,
          startDate: { $lte: end },
          endDate: { $gte: start }
        });

    if (overlap) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'This date range overlaps with an existing Financial Year for this branch.',
        errorCode: 'FINANCIAL_YEAR_OVERLAP'
      });
    }

    const [fy] = await FinancialYear.create([
      {
        companyId,
        branchId,
        startDate: start,
        endDate: end,
        yearLabel,
        ...(isLocked !== undefined ? { isLocked } : {}),
        ...(status !== undefined ? { status } : {})
      }
    ], sessionOpts);

    const updateFields = {
      financialYearCreated: true,
      financialYearId: fy._id
    };

    await User.findByIdAndUpdate(req.user._id, updateFields, { new: true, ...sessionOpts });

    if (transactionStarted) {
      await session.commitTransaction();
    }

    return res.status(201).json({
      success: true,
      message: 'Financial Year created successfully',
      data: {
        ...fy.toObject(),
        nextStep: 'DASHBOARD'
      }
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (ignore) {
        // Ignore abort errors when transaction support is unavailable.
      }
    }
    next(error);
  } finally {
    await session.endSession();
  }
};

/**
 * GET /api/financial-year?companyId=&branchId=
 * List all financial years for a company, optionally for one branch
 */
const listFinancialYears = async (req, res, next) => {
  try {
    const { companyId, branchId } = req.query;
    const filter = { companyId };

    if (branchId) {
      const branch = await Branch.findOne({ _id: branchId, companyId });
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: 'Branch does not belong to the specified company',
          errorCode: 'INVALID_BRANCH_COMPANY'
        });
      }
      filter.branchId = branchId;
    }

    const financialYears = await FinancialYear.find(filter).sort({ startDate: 1 });

    return res.status(200).json({
      success: true,
      data: financialYears
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/financial-year/:id/lock
 * Lock a financial year to prevent transaction postings
 */
const lockFinancialYear = async (req, res, next) => {
  try {
    const fy = req.financialYear; // loaded by checkCompanyAccess middleware

    if (fy.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This financial year is already locked',
        errorCode: 'ALREADY_LOCKED'
      });
    }

    fy.isLocked = true;
    fy.lockedAt = new Date();
    fy.lockedBy = req.user._id;

    await fy.save();

    return res.status(200).json({
      success: true,
      data: fy
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFinancialYear,
  listFinancialYears,
  lockFinancialYear
};
