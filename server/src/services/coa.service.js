const ChartOfAccount = require('../models/ChartOfAccount');

const RANGES = {
  Asset: { min: 1000, max: 1999 },
  Liability: { min: 2000, max: 2999 },
  Equity: { min: 3000, max: 3999 },
  Income: { min: 4000, max: 4999 },
  Expense: { min: 5000, max: 5999 }
};

/**
 * Get current balance of an account.
 * For now, returns the opening balance as a placeholder.
 * @param {string} accountId 
 * @returns {Promise<number>}
 */
const getAccountBalance = async (accountId) => {
  const account = await ChartOfAccount.findById(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  // TODO: sum posted journal lines once Module 12 (Journal Entry) exists
  return account.openingBalance;
};

/**
 * Check if the account has any transaction postings.
 * For now, returns false as a placeholder.
 * @param {string} accountId 
 * @returns {Promise<boolean>}
 */
const hasTransactions = async (accountId) => {
  // TODO: check if any posted journal lines exist referencing this account once Module 12 (Journal Entry) exists
  return false;
};

/**
 * Generate next available numeric code for a given type and company.
 * @param {string} companyId 
 * @param {string} type 
 * @returns {Promise<string>}
 */
const generateNextCode = async (companyId, type) => {
  const range = RANGES[type];
  if (!range) {
    throw new Error(`Invalid account type: ${type}`);
  }

  // Find all accounts for the company of the specified type
  const accounts = await ChartOfAccount.find({
    companyId,
    type,
    code: { $regex: /^\d+$/ }
  }).select('code');

  let maxCode = range.min - 1;
  for (const acc of accounts) {
    const num = parseInt(acc.code, 10);
    if (!isNaN(num) && num >= range.min && num <= range.max) {
      if (num > maxCode) {
        maxCode = num;
      }
    }
  }

  const nextCodeNum = maxCode + 1;
  if (nextCodeNum > range.max) {
    const err = new Error(`No available codes left in the range for ${type}`);
    err.statusCode = 400;
    throw err;
  }

  return String(nextCodeNum);
};

/**
 * Seed default Chart of Accounts for a company.
 * @param {string} companyId 
 * @returns {Promise<number>} Number of accounts seeded
 */
const seedDefaultCoa = async (companyId) => {
  // Idempotency check: Reject if default COA is already seeded
  const existingSystemAcc = await ChartOfAccount.findOne({ companyId, isSystemAccount: true });
  if (existingSystemAcc) {
    const err = new Error('Default COA already seeded for this company');
    err.statusCode = 409;
    throw err;
  }

  const defaultCOA = [
    // Assets
    { name: 'Assets', type: 'Asset', isGroup: true, code: '1000', parentName: null },
    { name: 'Fixed Assets', type: 'Asset', isGroup: true, code: '1100', parentName: 'Assets' },
    { name: 'Current Assets', type: 'Asset', isGroup: true, code: '1200', parentName: 'Assets' },
    { name: 'Cash-in-Hand', type: 'Asset', isGroup: false, code: '1210', parentName: 'Current Assets' },
    { name: 'Bank Accounts', type: 'Asset', isGroup: true, code: '1220', parentName: 'Current Assets' },
    { name: 'Sundry Debtors', type: 'Asset', isGroup: true, code: '1230', parentName: 'Current Assets' },
    { name: 'Stock-in-Hand', type: 'Asset', isGroup: false, code: '1240', parentName: 'Current Assets' },

    // Liabilities
    { name: 'Liabilities', type: 'Liability', isGroup: true, code: '2000', parentName: null },
    { name: 'Capital Account', type: 'Liability', isGroup: true, code: '2100', parentName: 'Liabilities' },
    { name: 'Loans (Liability)', type: 'Liability', isGroup: true, code: '2200', parentName: 'Liabilities' },
    { name: 'Current Liabilities', type: 'Liability', isGroup: true, code: '2300', parentName: 'Liabilities' },
    { name: 'Sundry Creditors', type: 'Liability', isGroup: true, code: '2310', parentName: 'Current Liabilities' },
    { name: 'Duties & Taxes', type: 'Liability', isGroup: true, code: '2320', parentName: 'Current Liabilities' },

    // Equity
    { name: 'Equity', type: 'Equity', isGroup: true, code: '3000', parentName: null },
    { name: 'Owner\'s Equity', type: 'Equity', isGroup: false, code: '3100', parentName: 'Equity' },
    { name: 'Retained Earnings', type: 'Equity', isGroup: false, code: '3200', parentName: 'Equity' },

    // Income
    { name: 'Income', type: 'Income', isGroup: true, code: '4000', parentName: null },
    { name: 'Direct Income', type: 'Income', isGroup: true, code: '4100', parentName: 'Income' },
    { name: 'Sales Accounts', type: 'Income', isGroup: false, code: '4110', parentName: 'Direct Income' },
    { name: 'Indirect Income', type: 'Income', isGroup: true, code: '4200', parentName: 'Income' },

    // Expenses
    { name: 'Expenses', type: 'Expense', isGroup: true, code: '5000', parentName: null },
    { name: 'Direct Expenses', type: 'Expense', isGroup: true, code: '5100', parentName: 'Expenses' },
    { name: 'Purchase Accounts', type: 'Expense', isGroup: false, code: '5110', parentName: 'Direct Expenses' },
    { name: 'Indirect Expenses', type: 'Expense', isGroup: true, code: '5200', parentName: 'Expenses' }
  ];

  const createdAccountsMap = {};
  let seededCount = 0;

  for (const acc of defaultCOA) {
    let parentId = null;
    if (acc.parentName) {
      parentId = createdAccountsMap[acc.parentName];
      if (!parentId) {
        throw new Error(`Parent account ${acc.parentName} not found during seeding`);
      }
    }

    const created = await ChartOfAccount.create({
      companyId,
      name: acc.name,
      type: acc.type,
      isGroup: acc.isGroup,
      code: acc.code,
      parentId,
      isSystemAccount: true,
      isActive: true,
      openingBalance: 0,
      openingBalanceType: 'Dr'
    });

    createdAccountsMap[acc.name] = created._id;
    seededCount++;
  }

  return seededCount;
};

module.exports = {
  getAccountBalance,
  hasTransactions,
  generateNextCode,
  seedDefaultCoa,
  RANGES
};
