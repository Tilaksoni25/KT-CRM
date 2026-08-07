const FinancialYear = require('../models/FinancialYear');
const Company = require('../models/Company');
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

    const { companyId, startDate, endDate, yearLabel, isLocked } = req.body;

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

    // Business Rule Check: Check for overlapping Financial Years for the same company
    const overlap = transactionStarted
      ? await FinancialYear.findOne({
          companyId,
          startDate: { $lte: end },
          endDate: { $gte: start }
        }).session(session)
      : await FinancialYear.findOne({
          companyId,
          startDate: { $lte: end },
          endDate: { $gte: start }
        });

    if (overlap) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'This date range overlaps with an existing Financial Year for this company.',
        errorCode: 'FINANCIAL_YEAR_OVERLAP'
      });
    }

    const [fy] = await FinancialYear.create([
      {
        companyId,
        startDate: start,
        endDate: end,
        yearLabel,
        ...(isLocked !== undefined ? { isLocked } : {})
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
 * GET /api/financial-year?companyId=
 * List all financial years for a company
 */
const listFinancialYears = async (req, res, next) => {
  try {
    const { companyId } = req.query;

    const financialYears = await FinancialYear.find({ companyId }).sort({ startDate: 1 });

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
