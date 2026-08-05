const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Role = require('../models/Role');
const FinancialYear = require('../models/FinancialYear');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');
const roleService = require('../services/role.service');

let mongoServer;
let tokenA; // Owner
let tokenB; // Admin (allowed)
let tokenC; // Employee (denied Reports view)
let userA;
let userB;
let userC;
let companyA;
let companyB;
let fyA;
let fyB;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await connectDB(uri);

  // Owner
  userA = await User.create({
    name: 'Owner A',
    email: 'owner-a-ca@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true
  });
  tokenA = generateAccessToken({ userId: userA._id.toString(), email: userA.email, role: userA.role });

  companyA = await Company.create({
    name: 'Alpha Corp',
    gstin: '27ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    createdBy: userA._id
  });

  companyB = await Company.create({
    name: 'Beta Corp',
    gstin: '27WXYZA1234F1Z5',
    pan: 'WXYZA1234F',
    createdBy: userA._id
  });

  // Seed roles for companyA so permission resolver knows role templates
  await roleService.seedDefaultRoles(companyA._id.toString());

  // User B: Admin role on companyA
  userB = await User.create({
    name: 'Admin User B',
    email: 'userb-ca@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true,
    companyId: companyA._id,
    companyAccess: [{
      companyId: companyA._id,
      role: 'Admin',
      isActive: true,
      invitedAt: new Date()
    }]
  });
  tokenB = generateAccessToken({ userId: userB._id.toString(), email: userB.email, role: userB.role });

  // User C: Employee role on companyA (Reports = none)
  userC = await User.create({
    name: 'Employee User C',
    email: 'userc-ca@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true,
    companyId: companyA._id,
    companyAccess: [{
      companyId: companyA._id,
      role: 'Employee',
      isActive: true,
      invitedAt: new Date()
    }]
  });
  tokenC = generateAccessToken({ userId: userC._id.toString(), email: userC.email, role: userC.role });

  // Create Financial Years
  fyA = await FinancialYear.create({
    companyId: companyA._id,
    startDate: new Date('2025-04-01'),
    endDate: new Date('2026-03-31'),
    yearLabel: '2025-26',
    isLocked: false
  });

  fyB = await FinancialYear.create({
    companyId: companyB._id,
    startDate: new Date('2025-04-01'),
    endDate: new Date('2026-03-31'),
    yearLabel: '2025-26',
    isLocked: false
  });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

describe('Module 15: CA Panel Integration Tests', () => {

  describe('GET /api/ca-panel/dashboard', () => {
    it('should return the full contract shape (including placeholders) successfully for company owner', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/dashboard?companyId=${companyA._id.toString()}&financialYearId=${fyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('company');
      expect(res.body.data.company.name).toBe('Alpha Corp');
      expect(res.body.data.financialYear.label).toBe('2025-26');
      expect(res.body.data).toHaveProperty('financialSnapshot');
      expect(res.body.data.financialSnapshot.trialBalance).toBeNull();
      expect(res.body.data).toHaveProperty('gstSummary');
      expect(res.body.data.gstSummary).toHaveProperty('netPayable');
      expect(res.body.data).toHaveProperty('auditFlags');
      expect(Array.isArray(res.body.data.auditFlags)).toBe(true);
    });

    it('should allow dashboard access for Admin role', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/dashboard?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny dashboard access for Employee role (Reports view none)', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/dashboard?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenC}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('INSUFFICIENT_PERMISSION');
    });

    it('should correctly reject a financialYearId that does not belong to the given companyId', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/dashboard?companyId=${companyA._id.toString()}&financialYearId=${fyB._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_FINANCIAL_YEAR_COMPANY');
    });
  });

  describe('GET /api/ca-panel/audit-report', () => {
    it('should return the placeholder shape without error when dates are omitted', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/audit-report?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalEvents).toBe(0);
      expect(Array.isArray(res.body.data.recentEvents)).toBe(true);
      expect(res.body.data.period.from).toBeNull();
    });

    it('should return the placeholder shape successfully with date parameters', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/audit-report?companyId=${companyA._id.toString()}&from=2025-04-01&to=2025-06-30`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.period.from).toBe('2025-04-01');
      expect(res.body.data.period.to).toBe('2025-06-30');
    });
  });

  describe('GET /api/ca-panel/income-tax-summary', () => {
    it('should successfully return the zeroed-out income tax summary shape', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/income-tax-summary?companyId=${companyA._id.toString()}&financialYearId=${fyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.financialYear.label).toBe('2025-26');
      expect(res.body.data.taxableIncome).toBe(0);
      expect(res.body.data.estimatedTaxPayable).toBe(0);
    });

    it('should reject when financialYearId is missing (400 Bad Request)', async () => {
      const res = await request(app)
        .get(`/api/ca-panel/income-tax-summary?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('FINANCIAL_YEAR_ID_REQUIRED');
    });

    it('should reject when financialYearId does not exist (404 Not Found)', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/ca-panel/income-tax-summary?companyId=${companyA._id.toString()}&financialYearId=${fakeId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('FINANCIAL_YEAR_NOT_FOUND');
    });
  });
});
