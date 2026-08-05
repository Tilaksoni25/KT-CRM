const Company = require('../models/Company');
const journalEntryService = require('../services/journalEntry.service');

const validDate = (value) => !value || (!Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}$/.test(value));

const canAccessCompany = async (user, companyId) => {
  const company = await Company.findById(companyId).select('createdBy');
  if (!company) return false;
  if (company.createdBy.toString() === user._id.toString()) return true;
  if (user.companyId?.toString() === companyId.toString()) return true;
  return user.companyAccess.some((access) => access.isActive && access.companyId.toString() === companyId.toString());
};

const createJournalEntry = async (req, res, next) => {
  try {
    const entry = await journalEntryService.createJournalEntry(req.body, req.user._id);
    return res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
};

const listJournalEntries = async (req, res, next) => {
  try {
    const { companyId, financialYearId, from, to } = req.query;
    if (!validDate(from) || !validDate(to) || (from && to && new Date(from) > new Date(to))) {
      return res.status(400).json({ success: false, message: 'Use a valid YYYY-MM-DD date range', errorCode: 'INVALID_DATE_RANGE' });
    }
    const entries = await journalEntryService.listJournalEntries(companyId, { financialYearId, from, to });
    return res.status(200).json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
};

const getJournalEntry = async (req, res, next) => {
  try {
    const entry = await journalEntryService.getJournalEntry(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Journal entry not found', errorCode: 'JOURNAL_ENTRY_NOT_FOUND' });
    if (!await canAccessCompany(req.user, entry.companyId)) {
      return res.status(403).json({ success: false, message: 'Access denied to this journal entry', errorCode: 'FORBIDDEN' });
    }
    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
};

const reverseJournalEntry = async (req, res, next) => {
  try {
    const entry = await journalEntryService.getJournalEntry(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Journal entry not found', errorCode: 'JOURNAL_ENTRY_NOT_FOUND' });
    if (!await canAccessCompany(req.user, entry.companyId)) {
      return res.status(403).json({ success: false, message: 'Access denied to this journal entry', errorCode: 'FORBIDDEN' });
    }
    const result = await journalEntryService.reverseJournalEntry(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createJournalEntry,
  listJournalEntries,
  getJournalEntry,
  reverseJournalEntry
};
