const mongoose = require('mongoose');

const taxSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    ratePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    taxCategory: {
      type: String,
      enum: ['Taxable', 'Exempt', 'NilRated', 'ZeroRated'],
      default: 'Taxable'
    },
    hsnSacApplicable: {
      type: Boolean,
      default: true
    },
    isSystemTax: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index on companyId and name, case-insensitive collation
taxSchema.index(
  { companyId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

const Tax = mongoose.model('Tax', taxSchema);

module.exports = Tax;
