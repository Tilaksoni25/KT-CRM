const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Tax = require('../models/Tax');
const FinancialYear = require('../models/FinancialYear');
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
  for (const line of data.lineItems) if (Math.abs(line.totalAmount - (line.taxableAmount + line.taxAmount)) > EPSILON) throw fail('line totalAmount is inconsistent', 400, 'INVALID_LINE_TOTAL');
};

const validateReferences = async (data) => {
  const fy = await FinancialYear.findById(data.financialYearId);
  if (!fy || id(fy.companyId) !== id(data.companyId)) throw fail('Financial year does not belong to the specified company', 400, 'INVALID_FINANCIAL_YEAR_COMPANY');
  if (fy.isLocked) throw fail('Cannot create invoice in a locked financial year', 409, 'FINANCIAL_YEAR_LOCKED');
  const invoiceDate = new Date(data.invoiceDate);
  if (invoiceDate < fy.startDate || invoiceDate > fy.endDate) throw fail('invoiceDate must fall within the selected financial year', 400, 'INVOICE_DATE_OUTSIDE_FINANCIAL_YEAR');
  const customer = await Customer.findOne({ _id: data.customerId, companyId: data.companyId, isActive: true });
  if (!customer) throw fail('Customer not found for this company', 404, 'CUSTOMER_NOT_FOUND');
  const taxIds = data.lineItems.filter((line) => line.taxRateId).map((line) => line.taxRateId);
  if (taxIds.length && await Tax.countDocuments({ _id: { $in: taxIds }, companyId: data.companyId, isActive: true }) !== new Set(taxIds).size) throw fail('One or more tax rates are invalid for this company', 400, 'INVALID_TAX_RATE');
  // TODO: validate productIds against Module 7 Product/Service once that model exists.
  return { fy, customer };
};

const shape = (invoice, detail = false) => ({ id: id(invoice._id), companyId: id(invoice.companyId), financialYearId: id(invoice.financialYearId), customerId: id(invoice.customerId), ...(detail ? { customer: invoice.customerId?.name ? { id: id(invoice.customerId._id), name: invoice.customerId.name } : null, reference: invoice.reference, lineItems: invoice.lineItems, notes: invoice.notes, meta: invoice.meta } : {}), invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate || null, status: invoice.status, ...(detail ? { subTotal: invoice.subTotal, discountTotal: invoice.discountTotal, taxTotal: invoice.taxTotal, roundOff: invoice.roundOff } : {}), grandTotal: invoice.grandTotal, balanceDue: invoice.balanceDue, ...(detail ? { journalEntryId: invoice.journalEntryId ? id(invoice.journalEntryId) : null } : {}), createdAt: invoice.createdAt, updatedAt: invoice.updatedAt });

const nextNumber = async (companyId, financialYearId, label) => {
  const last = await Invoice.findOne({ companyId, financialYearId }).sort({ invoiceSequence: -1 }).select('invoiceSequence');
  const sequence = (last?.invoiceSequence || 0) + 1;
  return { sequence, invoiceNumber: `INV-${label.replace(/\s+/g, '')}-${String(sequence).padStart(4, '0')}` };
};

const createInvoice = async (data, userId) => {
  validateTotals(data); const { fy } = await validateReferences(data);
  // TODO: create Module 12 JournalEntry: Dr customer AR grandTotal; Cr revenue and Output GST.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { sequence, invoiceNumber } = await nextNumber(data.companyId, data.financialYearId, fy.yearLabel);
    try { const invoice = await Invoice.create({ ...data, invoiceDate: new Date(data.invoiceDate), dueDate: data.dueDate ? new Date(data.dueDate) : null, invoiceSequence: sequence, invoiceNumber, balanceDue: data.grandTotal, createdBy: userId, updatedBy: userId }); return shape(invoice, true); }
    catch (error) { if (error?.code !== 11000 || attempt === 2) throw error; }
  }
};
const listInvoices = async (companyId, q) => { const filter = { companyId }; if (q.customerId) filter.customerId = q.customerId; if (q.status) filter.status = { $in: q.status.split(',') }; if (q.from || q.to) { filter.invoiceDate = {}; if (q.from) filter.invoiceDate.$gte = new Date(q.from); if (q.to) filter.invoiceDate.$lte = new Date(q.to); } if (q.search) filter.$or = [{ invoiceNumber: new RegExp(q.search, 'i') }, { reference: new RegExp(q.search, 'i') }]; const [items, total] = await Promise.all([Invoice.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), Invoice.countDocuments(filter)]); return { items: items.map((i) => shape(i)), pagination: { page: q.page, limit: q.limit, total } }; };
const getInvoice = async (idValue) => { if (!mongoose.isValidObjectId(idValue)) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND'); const invoice = await Invoice.findById(idValue).populate('customerId', 'name').lean(); if (!invoice) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND'); return invoice; };
const getInvoiceDocument = async (idValue) => { if (!mongoose.isValidObjectId(idValue)) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND'); const invoice = await Invoice.findById(idValue); if (!invoice) throw fail('Invoice not found', 404, 'INVOICE_NOT_FOUND'); return invoice; };
const updateInvoice = async (invoice, data, userId) => { if (invoice.status === 'CANCELLED') throw fail('Cancelled invoice cannot be edited', 400, 'INVOICE_CANCELLED'); if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID' || invoice.appliedPayments?.length) throw fail('Invoice cannot be edited after payment.', 400, 'INVOICE_HAS_PAYMENT'); validateTotals(data); await validateReferences({ ...data, companyId: id(invoice.companyId), financialYearId: id(invoice.financialYearId), customerId: id(invoice.customerId) }); Object.assign(invoice, data, { invoiceDate: new Date(data.invoiceDate), dueDate: data.dueDate ? new Date(data.dueDate) : null, balanceDue: data.grandTotal, updatedBy: userId }); await invoice.save(); return { id: id(invoice._id), status: invoice.status, grandTotal: invoice.grandTotal, balanceDue: invoice.balanceDue, updatedAt: invoice.updatedAt }; };
const cancelInvoice = async (invoice, userId) => { if (invoice.status === 'CANCELLED') throw fail('Invoice is already cancelled', 409, 'INVOICE_ALREADY_CANCELLED'); if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID' || invoice.appliedPayments?.length) throw fail('Invoice cannot be cancelled after payment.', 400, 'INVOICE_HAS_PAYMENT'); if (invoice.journalEntryId) { const reversal = await journalService.reverseJournalEntry(invoice.journalEntryId, userId); invoice.reversalJournalEntryId = reversal.reversal._id; } // TODO: Module 12 reversal is used once invoice posting is enabled.
  invoice.status = 'CANCELLED'; invoice.cancelledAt = new Date(); invoice.cancelledBy = userId; invoice.updatedBy = userId; await invoice.save(); return { id: id(invoice._id), status: invoice.status, cancelledAt: invoice.cancelledAt }; };
module.exports = { createInvoice, listInvoices, getInvoice, getInvoiceDocument, updateInvoice, cancelInvoice, shape };
