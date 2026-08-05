const BankAccount = require('../models/BankAccount');
const BankReconciliation = require('../models/BankReconciliation');
const ChartOfAccount = require('../models/ChartOfAccount');
const bankAccountService = require('../services/bankAccount.service');

/**
 * POST /api/bank-account
 * Create a new bank/cash/wallet/card account
 */
const createBankAccount = async (req, res, next) => {
  try {
    const {
      companyId,
      accountType,
      accountName,
      bankName,
      accountNumber,
      ifscCode,
      branchName,
      openingBalance,
      openingBalanceDate
    } = req.body;

    // Auto-create/link corresponding COA ledger account
    const coaAccountId = await bankAccountService.createLinkedCoaAccount(
      companyId,
      accountName,
      accountType
    );

    const bankAccount = await BankAccount.create({
      companyId,
      accountType,
      accountName,
      bankName,
      accountNumber,
      ifscCode,
      branchName,
      openingBalance,
      openingBalanceDate,
      coaAccountId,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      data: bankAccount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/bank-account
 * List accounts for a company
 */
const listBankAccounts = async (req, res, next) => {
  try {
    const { companyId, includeInactive } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID query parameter is required'
      });
    }

    const filter = { companyId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    // Explicitly select accountNumber so we can mask it in the list view response
    const accounts = await BankAccount.find(filter)
      .select('+accountNumber')
      .lean();

    const formattedAccounts = accounts.map(acc => {
      if (acc.accountNumber) {
        acc.accountNumber = bankAccountService.maskAccountNumber(acc.accountNumber);
      }
      return acc;
    });

    return res.status(200).json({
      success: true,
      data: formattedAccounts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/bank-account/:id
 * Single account + current balance
 */
const getBankAccountDetails = async (req, res, next) => {
  try {
    // Explicitly select accountNumber for detail view
    const bankAccount = await BankAccount.findById(req.params.id)
      .select('+accountNumber')
      .lean();

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }

    const currentBalance = await bankAccountService.getAccountBalance(bankAccount.coaAccountId);

    return res.status(200).json({
      success: true,
      data: {
        ...bankAccount,
        currentBalance
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/bank-account/:id
 * Update account details
 */
const updateBankAccount = async (req, res, next) => {
  try {
    const bankAccount = req.bankAccount; // loaded and cached by middleware
    const updates = req.body;

    // Reject changes to accountType, accountNumber, or coaAccountId
    if ('accountType' in updates || 'accountNumber' in updates || 'coaAccountId' in updates) {
      return res.status(400).json({
        success: false,
        message: 'accountType, accountNumber, and coaAccountId cannot be changed after creation; deactivate this account and create a new one instead'
      });
    }

    // Update conditional fields
    if (updates.accountName !== undefined) {
      bankAccount.accountName = updates.accountName;
      // Sync COA account name
      await ChartOfAccount.findByIdAndUpdate(bankAccount.coaAccountId, { name: updates.accountName });
    }

    if (updates.bankName !== undefined) bankAccount.bankName = updates.bankName;
    if (updates.ifscCode !== undefined) bankAccount.ifscCode = updates.ifscCode;
    if (updates.branchName !== undefined) bankAccount.branchName = updates.branchName;

    if (updates.isActive !== undefined) {
      bankAccount.isActive = updates.isActive;
      // Sync COA account active state
      await ChartOfAccount.findByIdAndUpdate(bankAccount.coaAccountId, { isActive: updates.isActive });
    }

    const saved = await bankAccount.save();

    return res.status(200).json({
      success: true,
      data: saved
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/bank-account/:id/ledger
 * Return transaction history for the account's linked COA account
 */
const getAccountLedger = async (req, res, next) => {
  try {
    const bankAccount = req.bankAccount; // loaded and cached by middleware
    const { from, to } = req.query;

    const ledgerData = await bankAccountService.getAccountLedger(bankAccount.coaAccountId, { from, to });

    return res.status(200).json({
      success: true,
      data: ledgerData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/bank-account/:id/reconcile
 * Reconcile bank statement lines
 */
const reconcileAccount = async (req, res, next) => {
  try {
    const bankAccount = req.bankAccount; // loaded and cached by middleware
    const { statementDate, statementLines } = req.body;

    const processedLines = await bankAccountService.attemptAutoMatch(
      bankAccount.coaAccountId,
      statementLines
    );

    const matchedCount = processedLines.filter(line => line.status === 'matched').length;
    const unmatchedCount = processedLines.filter(line => line.status === 'unmatched').length;

    const reconciliation = await BankReconciliation.create({
      companyId: bankAccount.companyId,
      bankAccountId: bankAccount._id,
      statementDate,
      lines: processedLines
    });

    return res.status(200).json({
      success: true,
      data: {
        reconciliationId: reconciliation._id,
        matchedCount,
        unmatchedCount,
        totalLines: processedLines.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBankAccount,
  listBankAccounts,
  getBankAccountDetails,
  updateBankAccount,
  getAccountLedger,
  reconcileAccount
};
