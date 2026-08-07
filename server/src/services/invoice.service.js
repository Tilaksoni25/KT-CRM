const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Tax = require('../models/Tax');
const FinancialYear = require('../models/FinancialYear');
const ChartOfAccount = require('../models/ChartOfAccount');
const journalService = require('./journalEntry.service');
const EPSILON = 0.01;

const fail = (message, statusCode = 400, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const id = (v) => v?.toString();

const validateTotals = (data) => {
  const subTotal = data.lineItems.reduce((sum, line) => sum + line.taxableAmount, 0);
  const taxTotal = data.lineItems.reduce((sum, line) => sum + line.taxAmount, 0);
  if (Math.abs(data.subTotal - subTotal) > EPSILON) throw fail('subTotal does not match line-item taxable amounts', 400, 'INVALID_TOTALS');
  if (Math.abs(data.taxTotal - taxTotal) > EPSILON) throw fail('taxTotal does not match line-item tax amounts', 400, 'INVALID_TOTALS');
  if (Math.abs(data.grandTotal - (data.subTotal - data.discountTotal + data.taxTotal + data.roundOff)) > EPSILON) throw fail('grandTotal is inconsistent with totals', 400, 'INVALID_TOTALS');
  if (data.grandTotal <= 0) throw fail('grandTotal must be greater than zero', 400, 'INVALID_TOTALS');
  for (const line of data.lineItems) {
    if (Math.abs(line.totalAmount - (line.taxableAmount + line.taxAmount)) > EPSILON) throw fail('line totalAmount is inconsistent', 400, 'INVALID_LINE_TOTAL');
  }
};

const validateReferences = async (data) => {
  const fy = await FinancialYear.findById(data.financialYearId);
  if (!fy || id(fy.companyId) !== id(data.companyId)) throw fail('Financial year does not belong to the specified company', 400, 'INVALID_FINANCIAL_YEAR_COMPANY');
  if (fy.isLocked) throw fail('Cannot create invoice in a locked financial year', 409, 'FINANCIAL_YEAR_LOCKED');
  const invoiceDate = new Date(data.invoiceDate);
  if (invoiceDate < fy.startDate || invoiceDate > fy.endDate) throw fail('invoiceDate must fall within the selected financial year', 400, 'INVOICE_DATE_OUTSIDE_FINANCIAL_YEAR');
  const customer = await Customer.findOne({ _id: data.customerId, companyId: data.companyId, isActive: true });
  if (!customer) throw fail('Customer not found for this company', 404, 'CUSTOMER_NOT_FOUND');

  const taxIds = [...new Set(data.lineItems.filter((line) => line.taxRateId).map((line) => line.taxRateId))];
  if (taxIds.length > 0) {
    const count = await Tax.countDocuments({ _id: { $in: taxIds }, companyId: data.companyId, isActive: true });
    if (count !== taxIds.length) throw fail('One or more tax rates are invalid for this company', 400, 'INVALID_TAX_RATE');
  }

  // TODO: validate productIds against Module 7 Product/Service once that model exists.
  return { fy, customer };
};

const shape = (invoice, detail = false) => ({
  id: id(invoice._id),
  companyId: id(invoice.companyId),
  financialYearId: id(invoice.financialYearId),
  customerId: id(invoice.customerId),
  ...(detail ? {
    customer: invoice.customerId?.name ? { id: id(invoice.customerId._id), name: invoice.customerId.name } : null,
    reference: invoice.reference,
    lineItems: invoice.lineItems,
    notes: invoice.notes,
    meta: invoice.meta
  } : {}),
  invoiceNumber: invoice.invoiceNumber,
  invoiceDate: invoice.invoiceDate,
  dueDate: invoice.dueDate || null,
  status: invoice.status,
  ...(detail ? { subTotal: invoice.subTotal, discountTotal: invoice.discountTotal, taxTotal: invoice.taxTotal, roundOff: invoice.roundOff } : {}),
  grandTotal: invoice.grandTotal,
  amountReceived: invoice.amountReceived || 0,
  balanceDue: invoice.balanceDue,
  ...(detail ? { journalEntryId: invoice.journalEntryId ? id(invoice.journalEntryId) : null, reversalJournalEntryId: invoice.reversalJournalEntryId ? id(invoice.reversalJournalEntryId) : null } : {}),
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt
});

const nextNumber = async (companyId, financialYearId, label) => {
  const last = await Invoice.findOne({ companyId, financialYearId }).sort({ invoiceSequence: -1 }).select('invoiceSequence');
  const sequence = (last?.invoiceSequence || 0) + 1;
  const invoiceNumber = `INV-${label.replace(/\s+/g, '')}-${String(sequence).padStart(4, '0')}`;
  return { sequence, invoiceNumber };
};

const createJournalEntryForInvoice = async (invoice, userId) => {
  const customerAccountId = invoice.customer?.coaAccountId || invoice.customerId;
  const customerAccount = customerAccountId ? await ChartOfAccount.findById(customerAccountId) : null;
  const salesAccount = await ChartOfAccount.findOne({ companyId: invoice.companyId, code: '4110', isActive: true });
  const gstAccount = await ChartOfAccount.findOne({ companyId: invoice.companyId, code: '2200', isActive: true });

  // TODO: real implementation should map customer AR from Module 3/5 and sales/output GST from COA/Module 25.
  const lines = [];
  if (customerAccount) {
    lines.push({ accountId: customerAccount._id, debit: invoice.grandTotal, credit: 0, remarks: 'Sales invoice receivable' });
  }
  if (salesAccount) {
    lines.push({ accountId: salesAccount._id, debit: 0, credit: invoice.subTotal - invoice.discountTotal, remarks: 'Sales revenue' });
  }
  if (gstAccount && invoice.taxTotal > 0) {
    lines.push({ accountId: gstAccount._id, debit: 0, credit: invoice.taxTotal, remarks: 'Output GST' });
  }

  if (lines.length < 2) {
    throw fail('Unable to create journal entry for invoice because required COA accounts are unavailable', 500, 'INVOICE_JOURNAL_ENTRY_FAILED');
  }

  const journalEntry = await journalService.createJournalEntry({
    companyId: invoice.companyId,
    financialYearId: invoice.financialYearId,
    entryDate: invoice.invoiceDate,
    reference: invoice.invoiceNumber,
    narration: `Sales invoice ${invoice.invoiceNumber}`,
    lines
  }, userId);

  return journalEntry;
};

const createInvoice = async (data, userId) => {
  validateTotals(data);
  const { fy, customer } = await validateReferences(data);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { sequence, invoiceNumber } = await nextNumber(data.companyId, data.financialYearId, fy.yearLabel);
    try {
      const invoiceDoc = await Invoice.create({
        ...data,
        companyId: data.companyId,
        financialYearId: data.financialYearId,
        customerId: data.customerId,
        invoiceDate: new Date(data.invoiceDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        invoiceSequence: sequence,
        invoiceNumber,
        amountReceived: 0,
        balanceDue: data.grandTotal,
        status: 'POSTED',
        createdBy: userId,
        updatedBy: userId
      });

      try {
        const journalEntry = await createJournalEntryForInvoice({ ...invoiceDoc.toObject(), customer }, userId);
        invoiceDoc.journalEntryId = journalEntry._id;
        invoiceDoc.updatedBy = userId;
        await invoiceDoc.save();
        return shape(invoiceDoc.toObject(), true);
      } catch (journalError) {
        await Invoice.deleteOne({ _id: invoiceDoc._id });
        throw journalError;
      }
    } catch (error) {
      if (error?.code !== 11000 || attempt === 2) throw error;
    }
  }
};

const listInvoices = async (companyId, q = {}) => {
  const filter = { companyId };
  if (q.customerId) filter.customerId = q.customerId;
  if (q.status) filter.status = { $in: q.status.split(',') };
  if (q.from || q.to) {
    filter.invoiceDate = {};
    if (q.from) filter.invoiceDate.$gte = new Date(q.from);
    if (q.to) filter.invoiceDate.$lte = new Date(q.to);
  }
  if (q.search) {
    filter.$or = [{ invoiceNumber: new RegExp(q.search, 'i') }, { reference: new RegExp(q.search, 'i') }];
  }

  const page = Number(q.page || 1);
  const limit = Number(q.limit || 20);
  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Invoice.countDocuments(filter)
  ]);

  return {
    items: items.map((item) => shape(item)),
    pagination: { page, limit, total }
  };
};

const getInvoice = async (idValue) => {
  if (!mongoose.isValidObjectId(idValue)) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  const invoice = await Invoice.findById(idValue).populate('customerId', 'name').lean();
  if (!invoice) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  return invoice;
};

const getInvoiceDocument = async (idValue) => {
  if (!mongoose.isValidObjectId(idValue)) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  const invoice = await Invoice.findById(idValue);
  if (!invoice) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  return invoice;
};

const updateInvoice = async (invoice, data, userId) => {
  if (invoice.status === 'CANCELLED') throw fail('Cancelled invoice cannot be edited', 400, 'INVOICE_CANCELLED');
  if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID' || (invoice.appliedPayments || []).length || (invoice.amountReceived || 0) > 0) throw fail('Invoice cannot be edited after payment.', 400, 'INVOICE_HAS_PAYMENT');

  validateTotals(data);
  await validateReferences({ ...data, companyId: id(invoice.companyId), financialYearId: id(invoice.financialYearId), customerId: id(invoice.customerId) });

  Object.assign(invoice, data, {
    invoiceDate: new Date(data.invoiceDate),
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    balanceDue: data.grandTotal,
    updatedBy: userId
  });
  await invoice.save();

  return { id: id(invoice._id), status: invoice.status, grandTotal: invoice.grandTotal, balanceDue: invoice.balanceDue, updatedAt: invoice.updatedAt };
};

const cancelInvoice = async (invoice, userId) => {
  if (invoice.status === 'CANCELLED') throw fail('Invoice is already cancelled', 409, 'INVOICE_ALREADY_CANCELLED');
  if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID' || (invoice.appliedPayments || []).length || (invoice.amountReceived || 0) > 0) throw fail('Invoice cannot be cancelled after payment.', 400, 'INVOICE_HAS_PAYMENT');

  let reversalJournalEntry = null;
  if (invoice.journalEntryId) {
    const reversal = await journalService.reverseJournalEntry(invoice.journalEntryId, userId);
    reversalJournalEntry = reversal.reversal;
  }

  invoice.status = 'CANCELLED';
  invoice.cancelledAt = new Date();
  invoice.cancelledBy = userId;
  invoice.reversalJournalEntryId = reversalJournalEntry ? reversalJournalEntry._id : null;
  invoice.updatedBy = userId;
  await invoice.save();

  return { id: id(invoice._id), status: invoice.status, cancelledAt: invoice.cancelledAt, reversalJournalEntryId: invoice.reversalJournalEntryId ? id(invoice.reversalJournalEntryId) : null };
};

module.exports = { createInvoice, listInvoices, getInvoice, getInvoiceDocument, updateInvoice, cancelInvoice, shape };
