const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const caPanelService = require('../services/caPanel.service');
const gstService = require('../services/gst.service');

/**
 * Common security check helper.
 * CA Panel is restricted to:
 * 1. Company Owner (creator)
 * 2. Super Admin, Admin, or CA roles (case-insensitive)
 */
const verifyAccess = (req, res) => {
  const isOwner = req.company.createdBy.toString() === req.user._id.toString();
  const roleName = req.callerRole?.name;
  const isAllowedRole = roleName && ['Super Admin', 'Admin', 'CA'].some(
    (r) => r.toLowerCase() === roleName.toLowerCase()
  );

  if (!isOwner && !isAllowedRole) {
    res.status(403).json({
      success: false,
      message: 'Access denied: CA Panel is restricted to Super Admin, Admin, or CA roles.',
      errorCode: 'CA_PANEL_RESTRICTED'
    });
    return false;
  }
  return true;
};

/**
 * GET /api/ca-panel/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    if (!verifyAccess(req)) return;

    const companyId = req.query.companyId;
    const { financialYearId } = req.query;

    let fyInfo = null;
    if (financialYearId) {
      const fy = await FinancialYear.findById(financialYearId);
      if (!fy) {
        return res.status(404).json({
          success: false,
          message: 'Financial year not found',
          errorCode: 'FINANCIAL_YEAR_NOT_FOUND'
        });
      }
      if (fy.companyId.toString() !== companyId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Financial year does not belong to the specified company',
          errorCode: 'INVALID_FINANCIAL_YEAR_COMPANY'
        });
      }
      fyInfo = {
        id: fy._id,
        label: fy.yearLabel,
        startDate: fy.startDate,
        endDate: fy.endDate
      };
    }

    const financialSnapshot = await caPanelService.getFinancialSnapshot(companyId, financialYearId);
    
    // Call gst returns summary if service exists
    let gstSummary = { period: null, netPayable: 0 };
    if (gstService && typeof gstService.getGstReturnsSummary === 'function') {
      const summary = await gstService.getGstReturnsSummary(companyId, {});
      gstSummary = {
        period: summary.period || null,
        netPayable: summary.netPayable || 0
      };
    }

    const auditFlags = await caPanelService.getRecentAuditFlags(companyId);

    return res.status(200).json({
      success: true,
      data: {
        company: {
          id: req.company._id,
          name: req.company.name
        },
        financialYear: fyInfo,
        financialSnapshot,
        gstSummary,
        auditFlags
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ca-panel/audit-report
 */
const getAuditReport = async (req, res, next) => {
  try {
    if (!verifyAccess(req)) return;

    const companyId = req.query.companyId;
    const { from, to } = req.query;

    const report = await caPanelService.getConsolidatedAuditReport(companyId, { from, to });

    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ca-panel/income-tax-summary
 */
const getIncomeTaxSummary = async (req, res, next) => {
  try {
    if (!verifyAccess(req)) return;

    const companyId = req.query.companyId;
    const { financialYearId } = req.query;

    if (!financialYearId) {
      return res.status(400).json({
        success: false,
        message: 'financialYearId parameter is required',
        errorCode: 'FINANCIAL_YEAR_ID_REQUIRED'
      });
    }

    const fy = await FinancialYear.findById(financialYearId);
    if (!fy) {
      return res.status(404).json({
        success: false,
        message: 'Financial year not found',
        errorCode: 'FINANCIAL_YEAR_NOT_FOUND'
      });
    }
    if (fy.companyId.toString() !== companyId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Financial year does not belong to the specified company',
        errorCode: 'INVALID_FINANCIAL_YEAR_COMPANY'
      });
    }

    const summary = await caPanelService.computeIncomeTaxSummary(companyId, financialYearId);

    return res.status(200).json({
      success: true,
      data: {
        financialYear: {
          id: fy._id,
          label: fy.yearLabel
        },
        ...summary
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getAuditReport,
  getIncomeTaxSummary
};
