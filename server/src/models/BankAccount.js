const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  accountType: {
    type: String,
    enum: ['Savings', 'Current', 'Cash', 'Wallet', 'CreditCard', 'UPI'],
    required: [true, 'Account type is required']
  },
  accountName: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    select: false, // Hidden by default from queries
    trim: true
  },
  ifscCode: {
    type: String,
    trim: true
  },
  branchName: {
    type: String,
    trim: true
  },
  coaAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    required: [true, 'Linked Chart of Accounts ledger ID is required']
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  openingBalanceDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for fast filtered listing
bankAccountSchema.index({ companyId: 1, accountType: 1 });

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

module.exports = BankAccount;
