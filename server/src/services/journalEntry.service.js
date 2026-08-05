const mongoose = require('mongoose');
const FinancialYear = require('../models/FinancialYear');
const ChartOfAccount = require('../models/ChartOfAccount');
const JournalEntry = require('../models/JournalEntry');

const AMOUNT_TOLERANCE = 0.0001;

const serviceError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const validateFinancialYear = async (companyId, financialYearId, entryDate) => {
  if (!mongoose.isValidObjectId(financialYearId)) {
    throw serviceError('Financial year not found', 404, 'FINANCIAL_YEAR_NOT_FOUND');
  }
  const financialYear = await FinancialYear.findById(financialYearId);
  if (!financialYear) throw serviceError('Financial year not found', 404, 'FINANCIAL_YEAR_NOT_FOUND');
  if (financialYear.companyId.toString() !== companyId.toString()) {
    throw serviceError('Financial year does not belong to the specified company', 400, 'INVALID_FINANCIAL_YEAR_COMPANY');
  }
  if (financialYear.isLocked) {
    throw serviceError('Cannot post to a locked financial year', 409, 'FINANCIAL_YEAR_LOCKED');
  }
  if (entryDate && (entryDate < financialYear.startDate || entryDate > financialYear.endDate)) {
    throw serviceError('entryDate must fall within the selected financial year', 400, 'ENTRY_DATE_OUTSIDE_FINANCIAL_YEAR');
  }
  return financialYear;
};

const validateLines = async (companyId, lines) => {
  const totalDebit = lines.reduce((total, line) => total + line.debit, 0);
  const totalCredit = lines.reduce((total, line) => total + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > AMOUNT_TOLERANCE) {
    throw serviceError('Total debit must equal total credit', 400, 'UNBALANCED_JOURNAL_ENTRY');
  }

  const accountIds = lines.map((line) => line.accountId);
  if (accountIds.some((accountId) => !mongoose.isValidObjectId(accountId))) {
    throw serviceError('One or more account IDs are invalid', 400, 'INVALID_ACCOUNT_IDS');
  }
  const accounts = await ChartOfAccount.find({
    _id: { $in: accountIds },
    companyId,
    isActive: true,
    isGroup: false
  }).select('_id');
  if (accounts.length !== new Set(accountIds.map(String)).size) {
    throw serviceError('Every account must be an active ledger account belonging to the company', 400, 'INVALID_ACCOUNT_IDS');
  }

  return { totalDebit, totalCredit };
};

const createJournalEntry = async (payload, userId) => {
  const entryDate = new Date(payload.entryDate);
  await validateFinancialYear(payload.companyId, payload.financialYearId, entryDate);
  const { totalDebit, totalCredit } = await validateLines(payload.companyId, payload.lines);

  return JournalEntry.create({
    ...payload,
    entryDate,
    totalDebit,
    totalCredit,
    createdBy: userId,
    updatedBy: userId
  });
};

const listJournalEntries = async (companyId, { financialYearId, from, to } = {}) => {
  const filter = { companyId };
  if (financialYearId) {
    await validateFinancialYear(companyId, financialYearId);
    filter.financialYearId = financialYearId;
  }
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  return JournalEntry.find(filter).sort({ entryDate: -1, createdAt: -1 }).lean();
};

const getJournalEntry = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return JournalEntry.findById(id).populate('lines.accountId', 'name code type').lean();
};

const reverseJournalEntry = async (id, userId) => {
  const original = await JournalEntry.findById(id);
  if (!original) throw serviceError('Journal entry not found', 404, 'JOURNAL_ENTRY_NOT_FOUND');
  if (original.reversedFrom) throw serviceError('A reversal entry cannot be reversed again', 400, 'REVERSAL_ENTRY_IMMUTABLE');
  if (original.isReversed) throw serviceError('Journal entry has already been reversed', 409, 'JOURNAL_ENTRY_ALREADY_REVERSED');

  await validateFinancialYear(original.companyId, original.financialYearId, original.entryDate);
  const reversal = await JournalEntry.create({
    companyId: original.companyId,
    financialYearId: original.financialYearId,
    entryDate: original.entryDate,
    reference: original.reference ? `REV-${original.reference}` : `REV-${original._id}`,
    narration: `Reversal of journal entry ${original._id}${original.narration ? `: ${original.narration}` : ''}`,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      remarks: line.remarks
    })),
    totalDebit: original.totalCredit,
    totalCredit: original.totalDebit,
    reversedFrom: original._id,
    createdBy: userId,
    updatedBy: userId
  });

  original.isReversed = true;
  original.reversalEntryId = reversal._id;
  original.updatedBy = userId;
  await original.save();

  return { original, reversal };
};

module.exports = {
  createJournalEntry,
  listJournalEntries,
  getJournalEntry,
  reverseJournalEntry
};
