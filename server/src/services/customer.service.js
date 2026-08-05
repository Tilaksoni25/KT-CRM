const ChartOfAccount = require('../models/ChartOfAccount');
const coaService = require('./coa.service');

/**
 * Validate GSTIN format using Indian GSTIN standard format.
 * TODO: replace with a call to Module 25's /api/gst/validate-gstin once that module exists.
 * @param {string} gstin 
 * @returns {boolean} True if valid, throws 400 error if invalid
 */
const validateGstin = (gstin) => {
  if (!gstin) return true;
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!regex.test(gstin)) {
    const error = new Error('Invalid GSTIN format');
    error.statusCode = 400;
    throw error;
  }
  return true;
};

/**
 * Check if the customer has associated sales invoices or payments.
 * TODO: check for linked invoices/payments once Module 8/9 exist.
 * @param {string} customerId 
 * @returns {Promise<boolean>}
 */
const hasTransactions = async (customerId) => {
  // Placeholder returning false until Invoice/Payment modules are implemented
  return false;
};

/**
 * Auto-creates a linked COA ledger account under the seeded "Sundry Debtors" group (code 1230).
 * @param {string} companyId 
 * @param {string} customerName 
 * @returns {Promise<string>} Created COA ledger ID
 */
const createLinkedCoaAccount = async (companyId, customerName) => {
  const parentCode = '1230'; // "Sundry Debtors" group

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
    name: customerName,
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

module.exports = {
  validateGstin,
  hasTransactions,
  createLinkedCoaAccount
};
