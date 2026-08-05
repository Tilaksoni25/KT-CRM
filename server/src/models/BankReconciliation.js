const mongoose = require('mongoose');

const reconciliationLineSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Line date is required']
  },
  description: {
    type: String,
    required: [true, 'Line description is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Line amount is required']
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: [true, 'Line transaction type (credit/debit) is required']
  },
  referenceNo: {
    type: String,
    trim: true
  },
  matchedLedgerEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  status: {
    type: String,
    enum: ['matched', 'unmatched'],
    default: 'unmatched'
  }
}, { _id: true });

const bankReconciliationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    required: [true, 'Bank account ID is required'],
    index: true
  },
  statementDate: {
    type: Date,
    required: [true, 'Statement date is required']
  },
  lines: [reconciliationLineSchema]
}, {
  timestamps: true
});

const BankReconciliation = mongoose.model('BankReconciliation', bankReconciliationSchema);

module.exports = BankReconciliation;
