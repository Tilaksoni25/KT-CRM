const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const ChartOfAccount = require('../models/ChartOfAccount');
const JournalEntry = require('../models/JournalEntry');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let token;
let company;
let financialYear;
let otherFinancialYear;
let debitAccount;
let creditAccount;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());
  const owner = await User.create({ name: 'Journal Owner', email: 'journal-owner@kevalon.com', passwordHash: 'hashed', role: 'user', isEmailVerified: true });
  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });
  company = await Company.create({ name: 'Journal Co', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', createdBy: owner._id });
  const otherCompany = await Company.create({ name: 'Other Journal Co', gstin: '27WXYZA1234F1Z5', pan: 'WXYZA1234F', createdBy: owner._id });
  financialYear = await FinancialYear.create({ companyId: company._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
  otherFinancialYear = await FinancialYear.create({ companyId: otherCompany._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
  debitAccount = await ChartOfAccount.create({ companyId: company._id, name: 'Adjustment Expense', code: '5001', type: 'Expense', isGroup: false });
  creditAccount = await ChartOfAccount.create({ companyId: company._id, name: 'Accrual Liability', code: '2001', type: 'Liability', isGroup: false });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const entryPayload = () => ({
  companyId: company._id.toString(),
  financialYearId: financialYear._id.toString(),
  entryDate: '2025-06-15',
  reference: 'ADJ-001',
  narration: 'Accrual adjustment',
  lines: [
    { accountId: debitAccount._id.toString(), debit: 1000 },
    { accountId: creditAccount._id.toString(), credit: 1000 }
  ]
});

const postEntry = (payload) => request(app).post('/api/journal-entry').set('Authorization', `Bearer ${token}`).send(payload);

describe('Module 12: Journal Entry integration tests', () => {
  it('creates a balanced journal entry', async () => {
    const res = await postEntry(entryPayload());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totalDebit: 1000, totalCredit: 1000, isReversed: false });
    expect(res.body.data.lines).toHaveLength(2);
  });

  it('rejects an unbalanced journal entry', async () => {
    const payload = entryPayload();
    payload.lines[1].credit = 900;
    const res = await postEntry(payload);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('UNBALANCED_JOURNAL_ENTRY');
  });

  it('fetches a single journal entry with populated lines', async () => {
    const created = await postEntry(entryPayload());
    const res = await request(app).get(`/api/journal-entry/${created.body.data._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lines).toHaveLength(2);
    expect(res.body.data.lines[0].accountId).toHaveProperty('name');
  });

  it('lists entries scoped to the company and financial year', async () => {
    const res = await request(app)
      .get(`/api/journal-entry?companyId=${company._id}&financialYearId=${financialYear._id}&from=2025-04-01&to=2026-03-31`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((entry) => entry.companyId.toString() === company._id.toString())).toBe(true);
  });

  it('reverses an entry without deleting its audit history', async () => {
    const created = await postEntry(entryPayload());
    const originalId = created.body.data._id;
    const res = await request(app).delete(`/api/journal-entry/${originalId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.original.isReversed).toBe(true);
    expect(res.body.data.reversal.reversedFrom.toString()).toBe(originalId);
    expect(res.body.data.reversal.lines[0]).toMatchObject({ debit: 0, credit: 1000 });

    const original = await JournalEntry.findById(originalId);
    expect(original).not.toBeNull();
    expect(original.reversalEntryId.toString()).toBe(res.body.data.reversal._id);
  });

  it('validates financial year ownership against companyId', async () => {
    const payload = entryPayload();
    payload.financialYearId = otherFinancialYear._id.toString();
    const res = await postEntry(payload);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FINANCIAL_YEAR_COMPANY');
  });
});
