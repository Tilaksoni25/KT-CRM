const mongoose = require('mongoose');

const financialYearSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  // A financial year belongs to one branch within a company.  `default: null`
  // keeps previously-created financial years readable; new API records require
  // this value through request validation.
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null,
    index: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  yearLabel: {
    type: String,
    required: [true, 'Year label (e.g. "2025-26") is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockedAt: {
    type: Date
  },
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

financialYearSchema.index({ companyId: 1, branchId: 1, startDate: 1, endDate: 1 });

const FinancialYear = mongoose.model('FinancialYear', financialYearSchema);

module.exports = FinancialYear;
