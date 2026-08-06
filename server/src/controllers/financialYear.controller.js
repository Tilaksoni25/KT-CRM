const FinancialYear = require('../models/FinancialYear');
const Company = require('../models/Company');
const User = require('../models/User');

/**
 * POST /api/financial-year
 * Create a new Financial Year for a company
 */
const createFinancialYear = async (req, res, next) => {
  try {
    const { companyId, startDate, endDate, yearLabel } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date',
        errorCode: 'INVALID_DATE_RANGE'
      });
    }

    // Business Rule Check: Check for overlapping Financial Years for the same company
    const overlap = await FinancialYear.findOne({
      companyId,
      startDate: { $lte: end },
      endDate: { $gte: start }
    });

    if (overlap) {
      return res.status(409).json({
        success: false,
        message: 'This date range overlaps with an existing Financial Year for this company.',
        errorCode: 'FINANCIAL_YEAR_OVERLAP'
      });
    }

    const fy = await FinancialYear.create({
      companyId,
      startDate: start,
      endDate: end,
      yearLabel
    });

    // Store setup progress for the owner; auth login recomputes it as a
    // fallback for companies that existed before this field was introduced.
    const company = await Company.findById(companyId).select('createdBy');
    if (company) await User.findByIdAndUpdate(company.createdBy, { financialYearCreated: true });

    return res.status(201).json({
      success: true,
      data: fy
    });
  } catch (error) {
    next(error);
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
