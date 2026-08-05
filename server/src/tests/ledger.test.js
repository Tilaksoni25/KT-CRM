const request = require('supertest');
const mongoose = require('mongoose');
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
let expenseAccount;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());

  const owner = await User.create({ name: 'Ledger Owner', email: 'ledger-owner@kevalon.com', passwordHash: 'hashed', role: 'user', isEmailVerified: true });
  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });
  company = await Company.create({ name: 'Ledger Co', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', createdBy: owner._id });
  const otherCompany = await Company.create({ name: 'Other Ledger Co', gstin: '27WXYZA1234F1Z5', pan: 'WXYZA1234F', createdBy: owner._id });
  financialYear = await FinancialYear.create({ companyId: company._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
  otherFinancialYear = await FinancialYear.create({ companyId: otherCompany._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
  expenseAccount = await ChartOfAccount.create({ companyId: company._id, name: 'Rent Expense', code: '5001', type: 'Expense', isGroup: false, openingBalance: 0 });
  const cashAccount = await ChartOfAccount.create({ companyId: company._id, name: 'Cash', code: '1001', type: 'Asset', isGroup: false, openingBalance: 0 });
  await JournalEntry.create({
    companyId: company._id,
    financialYearId: financialYear._id,
    entryDate: new Date('2025-05-10'),
    reference: 'RENT-001',
    narration: 'Monthly rent',
    lines: [
      { accountId: expenseAccount._id, debit: 1200, credit: 0 },
      { accountId: cashAccount._id, debit: 0, credit: 1200 }
    ],
    totalDebit: 1200,
    totalCredit: 1200,
    createdBy: owner._id,
    updatedBy: owner._id
  });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const getLedger = (path) => request(app).get(path).set('Authorization', `Bearer ${token}`);

describe('Module 13: Ledger integration tests', () => {
  it('returns chronological ledger history with the complete contract', async () => {
    const res = await getLedger(`/api/ledger/${expenseAccount._id}?companyId=${company._id}&financialYearId=${financialYear._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      account: { id: expenseAccount._id.toString(), name: 'Rent Expense', code: '5001' },
      companyId: company._id.toString(),
      financialYear: { label: '2025-26' },
      period: { from: null, to: null },
      openingBalance: 0,
      closingBalance: 1200,
      totals: { debit: 1200, credit: 0 }
    });
    expect(res.body.data.entries).toHaveLength(1);
    expect(res.body.data.entries[0]).toMatchObject({ reference: 'RENT-001', debit: 1200, credit: 0, runningBalance: 1200, balanceType: 'DR' });
  });

  it('returns the current balance summary contract', async () => {
    const res = await getLedger(`/api/ledger/${expenseAccount._id}/balance?companyId=${company._id}&financialYearId=${financialYear._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      account: { id: expenseAccount._id.toString(), name: 'Rent Expense', code: '5001' },
      companyId: company._id.toString(),
      financialYear: { label: '2025-26' },
      period: { from: null, to: null },
      balance: 1200,
      balanceType: 'DR'
    });
  });

  it('rejects a missing or invalid companyId', async () => {
    const missing = await getLedger(`/api/ledger/${expenseAccount._id}`);
    expect(missing.status).toBe(400);
    expect(missing.body.errorCode).toBe('INVALID_LEDGER_QUERY');

    const invalid = await getLedger(`/api/ledger/${expenseAccount._id}?companyId=invalid`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.errorCode).toBe('INVALID_LEDGER_QUERY');
  });

  it('rejects a financial year that belongs to another company', async () => {
    const res = await getLedger(`/api/ledger/${expenseAccount._id}?companyId=${company._id}&financialYearId=${otherFinancialYear._id}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FINANCIAL_YEAR_COMPANY');
  });

  it('rejects an unknown accountId', async () => {
    const res = await getLedger(`/api/ledger/${new mongoose.Types.ObjectId()}?companyId=${company._id}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('ACCOUNT_NOT_FOUND');
  });
});
