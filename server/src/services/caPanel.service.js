const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const gstService = require('./gst.service');

/**
 * Trials / P&L / Balance Sheet snapshot.
 * Returns a zeroed/null shape for now.
 * TODO: wire to Module 14 (Reports) once it exists.
 *
 * @param {string} companyId
 * @param {string} [financialYearId]
 * @returns {Promise<Object>}
 */
const getFinancialSnapshot = async (companyId, financialYearId) => {
  // TODO: wire to Module 14 (Reports) once it exists
  return {
    trialBalance: null,
    profitLoss: null,
    balanceSheet: null
  };
};

/**
 * Fetch recent audit flags/alerts.
 * Returns an empty array for now.
 * TODO: wire to Module 22 (Audit Log) once it exists.
 *
 * @param {string} companyId
 * @returns {Promise<Array>}
 */
const getRecentAuditFlags = async (companyId) => {
  // TODO: wire to Module 22 (Audit Log) once it exists
  return [];
};

/**
 * Returns consolidated audit report by grouping events.
 * Returns a placeholder shape.
 * TODO: wire to Module 22 (Audit Log)'s GET /api/audit-log?companyId= once it exists
 * — group by module and action type, list the most recent 20 events.
 *
 * @param {string} companyId
 * @param {Object} range - { from, to }
 * @returns {Promise<Object>}
 */
const getConsolidatedAuditReport = async (companyId, { from, to }) => {
  // TODO: wire to Module 22 (Audit Log) once it exists
  return {
    companyId,
    period: {
      from: from || null,
      to: to || null
    },
    totalEvents: 0,
    byModule: [],
    byActionType: [],
    recentEvents: []
  };
};

/**
 * Computes estimated income tax summary for a company and financial year.
 * Returns a zeroed shape with a detailed explanation note.
 *
 * TODO: Pull total income and total allowable expenses from the Profit & Loss statement
 * (Module 14, itself built from Module 12 Journal Entry postings).
 * Compute taxable income as totalIncome - totalExpenses.
 * Apply the applicable entity tax slab (configurable slab table, do not hardcode Indian tax slabs).
 *
 * @param {string} companyId
 * @param {string} financialYearId
 * @returns {Promise<Object>}
 */
const computeIncomeTaxSummary = async (companyId, financialYearId) => {
  // TODO: pull total income & expenses from Module 14 reports
  return {
    totalIncome: 0,
    totalExpenses: 0,
    taxableIncome: 0,
    estimatedTaxPayable: 0,
    note: 'Placeholder — real computation pending Module 14 (Reports)'
  };
};

module.exports = {
  getFinancialSnapshot,
  getRecentAuditFlags,
  getConsolidatedAuditReport,
  computeIncomeTaxSummary
};
