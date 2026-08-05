const mongoose = require('mongoose');
const FinancialYear = require('../models/FinancialYear');
const reportsService = require('../services/reports.service');

const REPORTS = {
  'trial-balance': reportsService.getTrialBalance,
  'profit-loss': reportsService.getProfitLoss,
  'balance-sheet': reportsService.getBalanceSheet,
  gst: reportsService.getGstReport
};

const isValidDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));

const validateFilters = async (req, res) => {
  const { companyId, financialYearId, from, to } = req.query;

  if (!companyId) {
    res.status(400).json({ success: false, message: 'companyId query parameter is required', errorCode: 'COMPANY_ID_REQUIRED' });
    return null;
  }
  if (!isValidDate(from) || !isValidDate(to)) {
    res.status(400).json({ success: false, message: 'from and to must use YYYY-MM-DD format', errorCode: 'INVALID_DATE_RANGE' });
    return null;
  }
  if (from && to && new Date(from) > new Date(to)) {
    res.status(400).json({ success: false, message: 'from must not be after to', errorCode: 'INVALID_DATE_RANGE' });
    return null;
  }

  let financialYear = null;
  if (financialYearId) {
    if (!mongoose.isValidObjectId(financialYearId)) {
      res.status(404).json({ success: false, message: 'Financial year not found', errorCode: 'FINANCIAL_YEAR_NOT_FOUND' });
      return null;
    }
    const fy = await FinancialYear.findById(financialYearId);
    if (!fy) {
      res.status(404).json({ success: false, message: 'Financial year not found', errorCode: 'FINANCIAL_YEAR_NOT_FOUND' });
      return null;
    }
    if (fy.companyId.toString() !== companyId.toString()) {
      res.status(400).json({ success: false, message: 'Financial year does not belong to the specified company', errorCode: 'INVALID_FINANCIAL_YEAR_COMPANY' });
      return null;
    }
    financialYear = { id: fy._id, label: fy.yearLabel };
  }

  return { companyId, financialYear, from: from || null, to: to || null };
};

const getReport = (reportType) => async (req, res, next) => {
  try {
    const filters = await validateFilters(req, res);
    if (!filters) return;
    const data = await REPORTS[reportType](filters.companyId, filters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const exportReport = (reportType) => async (req, res, next) => {
  try {
    const filters = await validateFilters(req, res);
    if (!filters) return;
    const payload = await REPORTS[reportType](filters.companyId, filters);
    return res.status(200).json({
      success: true,
      data: {
        reportType,
        companyId: filters.companyId,
        financialYear: filters.financialYear,
        exportFormat: 'json',
        downloadUrl: null,
        payload
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTrialBalance: getReport('trial-balance'),
  getProfitLoss: getReport('profit-loss'),
  getBalanceSheet: getReport('balance-sheet'),
  getGstReport: getReport('gst'),
  exportTrialBalance: exportReport('trial-balance'),
  exportProfitLoss: exportReport('profit-loss'),
  exportBalanceSheet: exportReport('balance-sheet'),
  exportGstReport: exportReport('gst')
};
