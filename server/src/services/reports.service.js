/**
 * Module 14 is intentionally a read-only aggregation layer.  These
 * placeholders retain the final API contract until the accounting modules are
 * available to supply their real calculations.
 */

const buildPeriod = ({ from, to }) => ({
  from: from || null,
  to: to || null
});

/**
 * TODO: Aggregate posted entries from Module 12 (Journal Entry), balances from
 * Module 13 (Ledger), and account metadata from Module 3 (Chart of Accounts).
 */
const getTrialBalance = async (companyId, filters = {}) => ({
  companyId,
  financialYear: filters.financialYear || null,
  period: buildPeriod(filters),
  totals: { debit: 0, credit: 0 },
  accounts: []
});

/**
 * TODO: Derive revenue from income accounts and sales postings, and expenses
 * from expense accounts plus journal/expense postings. Net profit is income
 * minus expenses. This depends on Modules 12, 13, and 3.
 */
const getProfitLoss = async (companyId, filters = {}) => ({
  companyId,
  financialYear: filters.financialYear || null,
  period: buildPeriod(filters),
  totalIncome: 0,
  totalExpenses: 0,
  netProfit: 0,
  lines: []
});

/**
 * TODO: Classify Module 13 ledger balances using Module 3 accounts into
 * assets, liabilities, and equity. Source postings come from Module 12.
 */
const getBalanceSheet = async (companyId, filters = {}) => ({
  companyId,
  financialYear: filters.financialYear || null,
  period: buildPeriod(filters),
  totals: { assets: 0, liabilities: 0, equity: 0 },
  assets: [],
  liabilities: [],
  equity: []
});

/**
 * TODO: Wire this to Module 25 (GST & Tax Master) when it is available. The
 * service is loaded defensively so this report remains usable in standalone
 * builds where Module 25 has not been installed yet.
 */
const getGstReport = async (companyId, filters = {}) => {
  let gstService;
  try {
    gstService = require('./gst.service');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  let gstSummary = null;
  if (typeof gstService?.getGstReturnsSummary === 'function') {
    gstSummary = await gstService.getGstReturnsSummary(companyId, filters);
  }

  return {
    companyId,
    period: buildPeriod(filters),
    summary: {
      gstr1: gstSummary?.gstr1 || null,
      gstr3b: gstSummary?.gstr3b || null,
      netPayable: gstSummary?.netPayable ?? 0
    }
  };
};

module.exports = {
  getTrialBalance,
  getProfitLoss,
  getBalanceSheet,
  getGstReport
};
