const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const Customer = require('../models/Customer');
const ChartOfAccount = require('../models/ChartOfAccount');
const Invoice = require('../models/Invoice');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let token;
let company;
let financialYear;
let customer;
let salesAccount;
let gstAccount;
let receivableAccount;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());

  const owner = await User.create({
    name: 'Invoice Owner',
    email: 'invoice-owner@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true
  });

  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });

  company = await Company.create({
    name: 'Invoice Co',
    gstin: '27ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    createdBy: owner._id
  });

  financialYear = await FinancialYear.create({
    companyId: company._id,
    startDate: new Date('2025-04-01'),
    endDate: new Date('2026-03-31'),
    yearLabel: '2025-26'
  });

  receivableAccount = await ChartOfAccount.create({
    companyId: company._id,
    name: 'Sundry Debtors',
    code: '1230',
    type: 'Asset',
    isGroup: false
  });

  salesAccount = await ChartOfAccount.create({
    companyId: company._id,
    name: 'Sales Income',
    code: '4110',
    type: 'Income',
    isGroup: false
  });

  gstAccount = await ChartOfAccount.create({
    companyId: company._id,
    name: 'Output GST',
    code: '2200',
    type: 'Liability',
    isGroup: false
  });

  customer = await Customer.create({
    companyId: company._id,
    name: 'Acme Pvt Ltd',
    gstin: '27FGHIJ1234F1Z5',
    email: 'acme@example.com',
    phone: '9999999999',
    billingAddress: { line1: '1 Main Road', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' },
    shippingAddress: { line1: '1 Main Road', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' },
    coaAccountId: receivableAccount._id,
    creditLimit: 50000,
    creditPeriodDays: 30
  });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const invoicePayload = () => ({
  companyId: company._id.toString(),
  financialYearId: financialYear._id.toString(),
  customerId: customer._id.toString(),
  invoiceDate: '2025-06-15',
  dueDate: '2025-06-30',
  reference: 'PO-1001',
  lineItems: [
    {
      description: 'Consulting service',
      quantity: 1,
      rate: 1000,
      discount: 0,
      taxableAmount: 1000,
      taxAmount: 180,
      totalAmount: 1180
    }
  ],
  subTotal: 1000,
  discountTotal: 0,
  taxTotal: 180,
  grandTotal: 1180,
  roundOff: 0,
  notes: 'Test invoice'
});

describe('Module 08: Sales Invoice integration tests', () => {
  it('creates an invoice and posts a linked journal entry', async () => {
    const res = await request(app)
      .post('/api/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send(invoicePayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('POSTED');
    expect(res.body.data.journalEntryId).toBeTruthy();
    expect(res.body.data.balanceDue).toBe(1180);
  });

  it('lists invoices with status/date filters', async () => {
    const res = await request(app)
      .get(`/api/invoice?companyId=${company._id}&status=POSTED&from=2025-01-01&to=2025-12-31`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('fetches a single invoice', async () => {
    const created = await request(app)
      .post('/api/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send(invoicePayload());

    const res = await request(app)
      .get(`/api/invoice/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoiceNumber).toBeTruthy();
    expect(res.body.data.grandTotal).toBe(1180);
  });

  it('prevents editing invoices once payment exists', async () => {
    const created = await request(app)
      .post('/api/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send(invoicePayload());

    const invoice = await Invoice.findById(created.body.data.id);
    invoice.amountReceived = 200;
    invoice.balanceDue = 980;
    await invoice.save();

    const res = await request(app)
      .put(`/api/invoice/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...invoicePayload(), notes: 'Updated after payment' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invoice cannot be edited after payment.');
  });

  it('cancels an invoice and creates a reversal journal entry', async () => {
    const created = await request(app)
      .post('/api/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send(invoicePayload());

    const res = await request(app)
      .delete(`/api/invoice/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.reversalJournalEntryId).toBeTruthy();
  });

  it('returns a placeholder PDF response', async () => {
    const created = await request(app)
      .post('/api/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send(invoicePayload());

    const res = await request(app)
      .get(`/api/invoice/${created.body.data.id}/pdf`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.downloadUrl).toBeNull();
    expect(res.body.data.note).toContain('Placeholder');
  });
});
