const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  rate: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  taxableAmount: { type: Number, required: true, min: 0 },
  taxRateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tax', default: null },
  taxAmount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true },
  invoiceSequence: { type: Number, required: true },
  invoiceDate: { type: Date, required: true, index: true },
  dueDate: { type: Date, default: null },
  reference: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'], default: 'POSTED', index: true },
  currency: { type: String, default: 'INR', uppercase: true },
  lineItems: { type: [lineItemSchema], required: true, validate: [(items) => items.length > 0, 'At least one line item is required'] },
  subTotal: { type: Number, required: true, min: 0 },
  discountTotal: { type: Number, default: 0, min: 0 },
  taxTotal: { type: Number, required: true, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  roundOff: { type: Number, default: 0 },
  amountReceived: { type: Number, default: 0, min: 0 },
  balanceDue: { type: Number, required: true, min: 0 },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  reversalJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  appliedPayments: { type: [mongoose.Schema.Types.ObjectId], ref: 'Payment', default: [] },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancellationReason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// TODO: replace this basic per-company/FY sequence with finalized invoice-numbering rules.
invoiceSchema.index({ companyId: 1, financialYearId: 1, invoiceSequence: 1 }, { unique: true });
invoiceSchema.index({ companyId: 1, financialYearId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ companyId: 1, invoiceDate: -1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
