const ChartOfAccount = require('../models/ChartOfAccount');
const coaService = require('./coa.service');

/**
 * Get current balance of a bank account's linked COA ledger.
 * Delegates to Module 3's coa.service.getAccountBalance().
 * @param {string} coaAccountId 
 * @returns {Promise<number>}
 */
const getAccountBalance = async (coaAccountId) => {
  return coaService.getAccountBalance(coaAccountId);
};

/**
 * Get transaction history/ledger for a bank account's linked COA ledger.
 * Placeholder until Module 13 (Ledger) exists.
 * @param {string} coaAccountId 
 * @param {Object} filterOptions 
 * @param {Date} [filterOptions.from]
 * @param {Date} [filterOptions.to]
 * @returns {Promise<Object>}
 */
const getAccountLedger = async (coaAccountId, { from, to } = {}) => {
  const currentBalance = await getAccountBalance(coaAccountId);
  
  // TODO: wire to Module 13 (Ledger) once it exists
  return {
    accountId: coaAccountId,
    currentBalance,
    transactions: []
  };
};

/**
 * Attempt to match bank statement lines against existing ledger entries.
 * Placeholder until Module 13 (Ledger) exists.
 * @param {string} coaAccountId 
 * @param {Array} statementLines 
 * @returns {Promise<Array>}
 */
const attemptAutoMatch = async (coaAccountId, statementLines) => {
  // TODO: implement real matching once Module 13 (Ledger) exists
  // For now, return every line as unmatched with status "unmatched"
  return statementLines.map(line => ({
    date: line.date,
    description: line.description,
    amount: line.amount,
    type: line.type,
    referenceNo: line.referenceNo,
    matchedLedgerEntryId: null,
    status: 'unmatched'
  }));
};

/**
 * Auto-creates a linked COA ledger account for a bank account.
 * Cash/Wallet types go under "Current Assets" (code 1200) because "Cash-in-Hand" (1210) is a ledger.
 * Savings/Current/CreditCard/UPI types go under "Bank Accounts" (code 1220).
 * @param {string} companyId 
 * @param {string} accountName 
 * @param {string} accountType 
 * @returns {Promise<string>} Created COA ledger ID
 */
const createLinkedCoaAccount = async (companyId, accountName, accountType) => {
  // Determine parent group code
  const parentCode = (accountType === 'Cash' || accountType === 'Wallet') ? '1200' : '1220';

  // Find parent account
  const parentCoa = await ChartOfAccount.findOne({ companyId, code: parentCode });
  if (!parentCoa) {
    const error = new Error('Default Chart of Accounts has not been seeded yet. Please seed the COA first.');
    error.statusCode = 409;
    throw error;
  }

  // Generate next available code
  const generatedCode = await coaService.generateNextCode(companyId, 'Asset');

  // Create the COA ledger account
  const coaAccount = await ChartOfAccount.create({
    companyId,
    name: accountName,
    type: 'Asset',
    isGroup: false,
    parentId: parentCoa._id,
    code: generatedCode,
    openingBalance: 0,
    openingBalanceType: 'Dr',
    isSystemAccount: false,
    isActive: true
  });

  return coaAccount._id;
};

/**
 * Mask account number to only display last 4 digits.
 * @param {string} accountNumber 
 * @returns {string}
 */
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return '';
  const cleaned = String(accountNumber).trim();
  if (cleaned.length <= 4) return cleaned;
  return '••••' + cleaned.slice(-4);
};

module.exports = {
  getAccountBalance,
  getAccountLedger,
  attemptAutoMatch,
  createLinkedCoaAccount,
  maskAccountNumber
};
