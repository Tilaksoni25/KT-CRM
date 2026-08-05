const mongoose = require('mongoose');

const journalLineSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    required: true
  },
  debit: { type: Number, default: 0, min: 0 },
  credit: { type: Number, default: 0, min: 0 },
  remarks: { type: String, trim: true, default: '' }
}, { _id: true });

const journalEntrySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    required: true,
    index: true
  },
  entryDate: { type: Date, required: true, index: true },
  reference: { type: String, trim: true, default: '' },
  narration: { type: String, trim: true, default: '' },
  lines: {
    type: [journalLineSchema],
    validate: {
      validator: (lines) => Array.isArray(lines) && lines.length >= 2,
      message: 'A journal entry must have at least two lines'
    }
  },
  totalDebit: { type: Number, required: true, min: 0 },
  totalCredit: { type: Number, required: true, min: 0 },
  isReversed: { type: Boolean, default: false, index: true },
  reversedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  reversalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

journalEntrySchema.index({ companyId: 1, financialYearId: 1, entryDate: -1, createdAt: -1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
