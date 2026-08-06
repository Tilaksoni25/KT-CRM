const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const ChartOfAccount = require('../models/ChartOfAccount');
const Customer = require('../models/Customer');
const BankAccount = require('../models/BankAccount');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const JournalEntry = require('../models/JournalEntry');

let mongoServer; let token; let company; let financialYear; let customer; let bankAccount; let invoice;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create(); await connectDB(mongoServer.getUri());
  const owner = await User.create({ name: 'Payment Owner', email: 'payment-owner@kevalon.com', passwordHash: 'hashed', isEmailVerified: true });
  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });
  company = await Company.create({ name: 'Payment Co', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', createdBy: owner._id });
  financialYear = await FinancialYear.create({ companyId: company._id, startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), yearLabel: '2026-27' });
  const arAccount = await ChartOfAccount.create({ companyId: company._id, name: 'Accounts Receivable', code: '1100', type: 'Asset', isGroup: false });
  const bankCoa = await ChartOfAccount.create({ companyId: company._id, name: 'HDFC Bank', code: '1001', type: 'Asset', isGroup: false });
  customer = await Customer.create({ companyId: company._id, name: 'Payment Customer', billingAddress: { line1: '1 Main St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }, coaAccountId: arAccount._id });
  bankAccount = await BankAccount.create({ companyId: company._id, accountType: 'Current', accountName: 'HDFC', bankName: 'HDFC', accountNumber: '1234', ifscCode: 'HDFC0001', coaAccountId: bankCoa._id });
  invoice = await Invoice.create({ companyId: company._id, financialYearId: financialYear._id, customerId: customer._id, invoiceNumber: 'INV-TEST-0001', invoiceSequence: 1, invoiceDate: new Date('2026-04-05'), lineItems: [{ description: 'Service', quantity: 1, rate: 1000, taxableAmount: 1000, taxAmount: 0, totalAmount: 1000 }], subTotal: 1000, taxTotal: 0, grandTotal: 1000, balanceDue: 1000, createdBy: owner._id, updatedBy: owner._id });
});

afterAll(async () => { await disconnectDB(); await mongoServer.stop(); });

const paymentPayload = (overrides = {}) => ({
  companyId: company._id.toString(), financialYearId: financialYear._id.toString(), customerId: customer._id.toString(),
  paymentDate: '2026-04-15', mode: 'BANK_TRANSFER', bankAccountId: bankAccount._id.toString(), reference: 'UTR-001', totalAmount: 1000,
  allocations: [{ invoiceId: invoice._id.toString(), allocatedAmount: 1000 }], ...overrides
});
const receive = (payload) => request(app).post('/api/payment/receive').set('Authorization', `Bearer ${token}`).send(payload);

describe('Module 9: Payment integration tests', () => {
  it('records a payment, posts a journal entry, and settles its invoice', async () => {
    const res = await receive(paymentPayload());
    expect(res.status).toBe(201); expect(res.body.data).toMatchObject({ paymentNumber: 'PR-0001', totalAmount: 1000, status: 'POSTED' });
    expect(res.body.data.journalEntryId).toBeTruthy();
    const updatedInvoice = await Invoice.findById(invoice._id); expect(updatedInvoice.status).toBe('PAID'); expect(updatedInvoice.balanceDue).toBe(0);
    expect(await JournalEntry.countDocuments()).toBe(1);
  });

  it('rejects strict-mode allocations that do not equal totalAmount', async () => {
    const res = await receive(paymentPayload({ totalAmount: 900 }));
    expect(res.status).toBe(400); expect(res.body.message).toBe('Validation failed');
  });

  it('rejects a financial year that belongs to another company', async () => {
    const other = await FinancialYear.create({ companyId: new (require('mongoose').Types.ObjectId)(), startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), yearLabel: '2026-27' });
    const res = await receive(paymentPayload({ financialYearId: other._id.toString() }));
    expect(res.status).toBe(400); expect(res.body.errorCode).toBe('INVALID_FINANCIAL_YEAR_COMPANY');
  });

  it('lists payments scoped to a company and gets a detail by id', async () => {
    const list = await request(app).get(`/api/payment?companyId=${company._id}&mode=BANK_TRANSFER`).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200); expect(list.body.data.items).toHaveLength(1); expect(list.body.data.pagination.total).toBe(1);
    const payment = await Payment.findOne();
    const detail = await request(app).get(`/api/payment/${payment._id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200); expect(detail.body.data.allocations).toHaveLength(1); expect(detail.body.data.journalEntryId).toBeTruthy();
  });
});
