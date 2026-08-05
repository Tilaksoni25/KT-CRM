const mongoose = require('mongoose');

const chartOfAccountSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Account code is required']
  },
  type: {
    type: String,
    enum: ['Asset', 'Liability', 'Equity', 'Income', 'Expense'],
    required: [true, 'Account type is required']
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    default: null
  },
  isSystemAccount: {
    type: Boolean,
    default: false
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  openingBalanceType: {
    type: String,
    enum: ['Dr', 'Cr'],
    default: 'Dr'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound unique index: code must be unique within each company
chartOfAccountSchema.index({ companyId: 1, code: 1 }, { unique: true });

// Index for optimizing parent/child queries (specifically tree-building)
chartOfAccountSchema.index({ companyId: 1, parentId: 1 });

const ChartOfAccount = mongoose.model('ChartOfAccount', chartOfAccountSchema);

module.exports = ChartOfAccount;
