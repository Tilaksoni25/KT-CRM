const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const FinancialYear = require('../models/FinancialYear');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let token;
let company;
let otherCompany;
let financialYear;
let otherFinancialYear;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());

  const owner = await User.create({ name: 'Reports Owner', email: 'reports-owner@kevalon.com', passwordHash: 'hashed', role: 'user', isEmailVerified: true });
  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });
  company = await Company.create({ name: 'Reports Co', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', createdBy: owner._id });
  otherCompany = await Company.create({ name: 'Other Co', gstin: '27WXYZA1234F1Z5', pan: 'WXYZA1234F', createdBy: owner._id });
  financialYear = await FinancialYear.create({ companyId: company._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
  otherFinancialYear = await FinancialYear.create({ companyId: otherCompany._id, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), yearLabel: '2025-26' });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const authorizedGet = (path) => request(app).get(path).set('Authorization', `Bearer ${token}`);

describe('Module 14: Reports integration tests', () => {
  it('returns the complete trial balance placeholder contract', async () => {
    const res = await authorizedGet(`/api/reports/trial-balance?companyId=${company._id}&financialYearId=${financialYear._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ companyId: company._id.toString(), financialYear: { label: '2025-26' }, period: { from: null, to: null }, totals: { debit: 0, credit: 0 }, accounts: [] });
  });

  it('returns the complete profit and loss placeholder contract', async () => {
    const res = await authorizedGet(`/api/reports/profit-loss?companyId=${company._id}&from=2025-04-01&to=2026-03-31`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ companyId: company._id.toString(), financialYear: null, period: { from: '2025-04-01', to: '2026-03-31' }, totalIncome: 0, totalExpenses: 0, netProfit: 0, lines: [] });
  });

  it('returns the complete balance sheet placeholder contract', async () => {
    const res = await authorizedGet(`/api/reports/balance-sheet?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totals: { assets: 0, liabilities: 0, equity: 0 }, assets: [], liabilities: [], equity: [] });
  });

  it('returns the GST placeholder contract', async () => {
    const res = await authorizedGet(`/api/reports/gst?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ companyId: company._id.toString(), period: { from: null, to: null }, summary: { gstr1: null, gstr3b: null, netPayable: 0 } });
  });

  it('returns JSON placeholder export metadata and the report payload', async () => {
    const res = await authorizedGet(`/api/reports/trial-balance/export?companyId=${company._id}&financialYearId=${financialYear._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ reportType: 'trial-balance', companyId: company._id.toString(), exportFormat: 'json', downloadUrl: null });
    expect(res.body.data.payload.accounts).toEqual([]);
  });

  it('rejects non-existent and mismatched financial years', async () => {
    const missing = await authorizedGet(`/api/reports/trial-balance?companyId=${company._id}&financialYearId=${new mongoose.Types.ObjectId()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.errorCode).toBe('FINANCIAL_YEAR_NOT_FOUND');

    const mismatched = await authorizedGet(`/api/reports/trial-balance?companyId=${company._id}&financialYearId=${otherFinancialYear._id}`);
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.errorCode).toBe('INVALID_FINANCIAL_YEAR_COMPANY');
  });

  it('falls back to the GST placeholder when Module 25 service is unavailable', async () => {
    jest.resetModules();
    jest.doMock('../services/gst.service', () => ({}));
    const isolatedReportsService = require('../services/reports.service');

    await expect(isolatedReportsService.getGstReport('company-id', {})).resolves.toEqual({
      companyId: 'company-id',
      period: { from: null, to: null },
      summary: { gstr1: null, gstr3b: null, netPayable: 0 }
    });

    jest.dontMock('../services/gst.service');
    jest.resetModules();
  });
});
