const mongoose = require('mongoose');
const ChartOfAccount = require('../models/ChartOfAccount');
const FinancialYear = require('../models/FinancialYear');
const JournalEntry = require('../models/JournalEntry');

const serviceError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const formatFinancialYear = (financialYear) => financialYear ? {
  id: financialYear._id,
  label: financialYear.yearLabel
} : null;

const resolveContext = async (accountId, filters) => {
  const { companyId, financialYearId } = filters;
  if (!mongoose.isValidObjectId(accountId)) {
    throw serviceError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }
  const account = await ChartOfAccount.findOne({ _id: accountId, companyId }).lean();
  if (!account) throw serviceError('Account not found', 404, 'ACCOUNT_NOT_FOUND');

  let financialYear = null;
  if (financialYearId) {
    financialYear = await FinancialYear.findById(financialYearId).lean();
    if (!financialYear) throw serviceError('Financial year not found', 404, 'FINANCIAL_YEAR_NOT_FOUND');
    if (financialYear.companyId.toString() !== companyId.toString()) {
      throw serviceError('Financial year does not belong to the specified company', 400, 'INVALID_FINANCIAL_YEAR_COMPANY');
    }
  }
  return { account, financialYear };
};

const signedOpeningBalance = (account) =>
  account.openingBalanceType === 'Cr' ? -account.openingBalance : account.openingBalance;

const balanceType = (amount) => amount >= 0 ? 'DR' : 'CR';

/**
 * Builds account movements from Module 12 Journal Entry lines.
 * TODO: Merge invoice, payment, purchase, expense, salary, and other posted
 * transactions as their modules expose accounting postings. Keep chronological
 * ordering and the same running-balance calculation for every source.
 */
const loadJournalMovements = async (accountId, filters) => {
  const journalFilter = { companyId: filters.companyId };
  if (filters.financialYearId) journalFilter.financialYearId = filters.financialYearId;

  const journals = await JournalEntry.find(journalFilter)
    .select('entryDate reference narration lines createdAt reversedFrom isReversed')
    .sort({ entryDate: 1, createdAt: 1 })
    .lean();

  return journals.flatMap((journal) => journal.lines
    .filter((line) => line.accountId.toString() === accountId.toString())
    .map((line, index) => ({
      date: journal.entryDate,
      createdAt: journal.createdAt,
      lineIndex: index,
      entryId: journal._id,
      source: 'journal-entry',
      reference: journal.reference || null,
      narration: journal.narration || null,
      remarks: line.remarks || null,
      debit: line.debit,
      credit: line.credit,
      isReversal: Boolean(journal.reversedFrom),
      movement: line.debit - line.credit
    })));
};

/**
 * Return chronological ledger history and running balances for one account.
 * Module 12 is the only live source today; this remains read-only.
 */
const getLedgerHistory = async (accountId, filters) => {
  const { account, financialYear } = await resolveContext(accountId, filters);
  const movements = await loadJournalMovements(accountId, filters);
  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null;
  const toDate = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;

  let runningBalance = signedOpeningBalance(account);
  for (const movement of movements) {
    if (fromDate && movement.date < fromDate) runningBalance += movement.movement;
  }
  const openingBalance = runningBalance;

  const visibleMovements = movements
    .filter((movement) => (!fromDate || movement.date >= fromDate) && (!toDate || movement.date <= toDate))
    .sort((a, b) => a.date - b.date || a.createdAt - b.createdAt || a.lineIndex - b.lineIndex);

  const entries = visibleMovements.map((movement) => {
    runningBalance += movement.movement;
    return {
      date: movement.date,
      entryId: movement.entryId,
      source: movement.source,
      reference: movement.reference,
      narration: movement.narration,
      remarks: movement.remarks,
      debit: movement.debit,
      credit: movement.credit,
      isReversal: movement.isReversal,
      runningBalance,
      balanceType: balanceType(runningBalance)
    };
  });

  return {
    account: { id: account._id, name: account.name, code: account.code },
    companyId: filters.companyId,
    financialYear: formatFinancialYear(financialYear),
    period: { from: filters.from || null, to: filters.to || null },
    openingBalance,
    entries,
    closingBalance: runningBalance,
    totals: {
      debit: visibleMovements.reduce((total, movement) => total + movement.debit, 0),
      credit: visibleMovements.reduce((total, movement) => total + movement.credit, 0)
    }
  };
};

const getLedgerBalance = async (accountId, filters) => {
  const history = await getLedgerHistory(accountId, filters);
  return {
    account: history.account,
    companyId: history.companyId,
    financialYear: history.financialYear,
    period: history.period,
    balance: Math.abs(history.closingBalance),
    balanceType: balanceType(history.closingBalance)
  };
};

module.exports = { getLedgerHistory, getLedgerBalance };
