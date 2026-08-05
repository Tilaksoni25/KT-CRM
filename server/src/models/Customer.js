const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  line1: {
    type: String,
    required: [true, 'Address line 1 is required']
  },
  line2: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required']
  },
  country: {
    type: String,
    default: 'India'
  }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  gstin: {
    type: String,
    uppercase: true,
    trim: true,
    default: null
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  billingAddress: {
    type: addressSchema,
    required: [true, 'Billing address is required']
  },
  shippingAddress: {
    type: addressSchema,
    default: function () {
      return this.billingAddress;
    }
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  creditPeriodDays: {
    type: Number,
    default: 0
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

// Sparse index for fast, scoped GSTIN unique lookups
customerSchema.index({ companyId: 1, gstin: 1 }, { sparse: true });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
