const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  allocatedAmount: { type: Number, required: true, min: 0.000001 }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  // TODO: replace this basic sequence with finalized per-company PR numbering rules.
  paymentNumber: { type: String, required: true, trim: true },
  paymentSequence: { type: Number, required: true },
  paymentDate: { type: Date, required: true, index: true },
  mode: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'], required: true },
  bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
  reference: { type: String, trim: true, default: '' },
  totalAmount: { type: Number, required: true, min: 0.000001 },
  allocations: { type: [allocationSchema], default: [] },
  status: { type: String, enum: ['POSTED', 'REVERSED'], default: 'POSTED', index: true },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  reversalJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

paymentSchema.index({ companyId: 1, financialYearId: 1, paymentSequence: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, paymentDate: -1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
