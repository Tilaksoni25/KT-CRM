const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const FinancialYear = require('../models/FinancialYear');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const BankAccount = require('../models/BankAccount');
const journalService = require('./journalEntry.service');

const EPSILON = 0.01;
const id = (value) => value?.toString();
const fail = (message, statusCode = 400, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });

const shape = (payment, detail = false) => ({
  id: id(payment._id), companyId: id(payment.companyId), financialYearId: id(payment.financialYearId), customerId: id(payment.customerId),
  paymentNumber: payment.paymentNumber, paymentDate: payment.paymentDate, mode: payment.mode, totalAmount: payment.totalAmount,
  status: payment.status, createdAt: payment.createdAt, ...(detail ? {
    bankAccountId: payment.bankAccountId ? id(payment.bankAccountId) : null, reference: payment.reference,
    allocations: payment.allocations.map((allocation) => ({ invoiceId: id(allocation.invoiceId), allocatedAmount: allocation.allocatedAmount })),
    journalEntryId: payment.journalEntryId ? id(payment.journalEntryId) : null,
    reversalJournalEntryId: payment.reversalJournalEntryId ? id(payment.reversalJournalEntryId) : null,
    notes: payment.notes, updatedAt: payment.updatedAt
  } : {})
});

const validateReferences = async (data) => {
  const financialYear = await FinancialYear.findById(data.financialYearId);
  if (!financialYear || id(financialYear.companyId) !== id(data.companyId)) throw fail('Financial year does not belong to the specified company', 400, 'INVALID_FINANCIAL_YEAR_COMPANY');
  if (financialYear.isLocked) throw fail('Cannot receive payment in a locked financial year', 409, 'FINANCIAL_YEAR_LOCKED');
  const paymentDate = new Date(data.paymentDate);
  if (paymentDate < financialYear.startDate || paymentDate > financialYear.endDate) throw fail('paymentDate must fall within the selected financial year', 400, 'PAYMENT_DATE_OUTSIDE_FINANCIAL_YEAR');
  const customer = await Customer.findOne({ _id: data.customerId, companyId: data.companyId, isActive: true });
  if (!customer) throw fail('Customer not found for this company', 404, 'CUSTOMER_NOT_FOUND');
  if (data.bankAccountId) {
    const account = await BankAccount.findOne({ _id: data.bankAccountId, companyId: data.companyId, isActive: true });
    if (!account) throw fail('Bank account not found for this company', 404, 'BANK_ACCOUNT_NOT_FOUND');
    return { financialYear, customer, bankAccount: account };
  }
  return { financialYear, customer, bankAccount: null };
};

const validateInvoices = async (data) => {
  const invoiceIds = data.allocations.map((allocation) => allocation.invoiceId);
  const invoices = await Invoice.find({ _id: { $in: invoiceIds }, companyId: data.companyId, customerId: data.customerId });
  if (invoices.length !== invoiceIds.length) throw fail('One or more invoices do not belong to this customer and company', 400, 'INVALID_ALLOCATION_INVOICE');
  const byId = new Map(invoices.map((invoice) => [id(invoice._id), invoice]));
  for (const allocation of data.allocations) {
    const invoice = byId.get(allocation.invoiceId);
    if (!invoice || !['POSTED', 'PARTIALLY_PAID'].includes(invoice.status)) throw fail('Payments can only be allocated to posted invoices', 400, 'INVOICE_NOT_PAYABLE');
    if (allocation.allocatedAmount - invoice.balanceDue > EPSILON) throw fail('Allocation exceeds invoice balance due', 400, 'ALLOCATION_EXCEEDS_BALANCE');
  }
  return byId;
};

const nextNumber = async (companyId, financialYearId) => {
  const last = await Payment.findOne({ companyId, financialYearId }).sort({ paymentSequence: -1 }).select('paymentSequence');
  const paymentSequence = (last?.paymentSequence || 0) + 1;
  return { paymentSequence, paymentNumber: `PR-${String(paymentSequence).padStart(4, '0')}` };
};

const postPaymentJournalEntry = async (payment, customer, bankAccount, userId) => {
  // TODO: CASH receipts without bankAccountId need a configured default cash account before they can be posted.
  if (!bankAccount) return null;
  // Dr Bank/Cash account; Cr Customer Accounts Receivable. Strict mode has no advance surplus.
  return journalService.createJournalEntry({
    companyId: id(payment.companyId), financialYearId: id(payment.financialYearId), entryDate: payment.paymentDate,
    reference: payment.reference || payment.paymentNumber,
    narration: `Customer receipt ${payment.paymentNumber}`,
    lines: [
      { accountId: id(bankAccount.coaAccountId), debit: payment.totalAmount, credit: 0, remarks: `Receipt ${payment.paymentNumber}` },
      { accountId: id(customer.coaAccountId), debit: 0, credit: payment.totalAmount, remarks: `Receipt ${payment.paymentNumber}` }
    ]
  }, userId);
};

const applyAllocations = async (payment, allocations, invoices) => {
  for (const allocation of allocations) {
    const invoice = invoices.get(allocation.invoiceId);
    invoice.balanceDue = Math.max(0, invoice.balanceDue - allocation.allocatedAmount);
    invoice.status = invoice.balanceDue <= EPSILON ? 'PAID' : 'PARTIALLY_PAID';
    invoice.appliedPayments.push(payment._id);
    await invoice.save();
  }
};

const createPayment = async (data, userId) => {
  const { financialYear, customer, bankAccount } = await validateReferences(data);
  const invoices = await validateInvoices(data);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const numbering = await nextNumber(data.companyId, data.financialYearId);
    try {
      const payment = await Payment.create({ ...data, ...numbering, paymentDate: new Date(data.paymentDate), bankAccountId: data.bankAccountId || null, createdBy: userId, updatedBy: userId });
      const journalEntry = await postPaymentJournalEntry(payment, customer, bankAccount, userId);
      if (journalEntry) { payment.journalEntryId = journalEntry._id; await payment.save(); }
      await applyAllocations(payment, data.allocations, invoices);
      return shape(payment, true);
    } catch (error) { if (error?.code !== 11000 || attempt === 2) throw error; }
  }
};

const listPayments = async (companyId, query) => {
  const filter = { companyId };
  for (const key of ['customerId', 'financialYearId', 'mode', 'status']) if (query[key]) filter[key] = query[key];
  if (query.from || query.to) { filter.paymentDate = {}; if (query.from) filter.paymentDate.$gte = new Date(query.from); if (query.to) filter.paymentDate.$lte = new Date(query.to); }
  const [items, total] = await Promise.all([Payment.find(filter).sort({ paymentDate: -1, createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), Payment.countDocuments(filter)]);
  return { items: items.map((payment) => shape(payment)), pagination: { page: query.page, limit: query.limit, total } };
};

const getPayment = async (paymentId) => {
  if (!mongoose.isValidObjectId(paymentId)) throw fail('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw fail('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  return payment;
};

module.exports = { createPayment, listPayments, getPayment, shape, postPaymentJournalEntry };
