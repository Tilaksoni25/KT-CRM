const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const FinancialYear = require('../models/FinancialYear');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let tokenA;
let tokenB;
let userA;
let userB;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await connectDB(uri);

  // Create two users for multi-tenant isolation testing
  userA = await User.create({
    name: 'User A',
    email: 'usera@kevalon.com',
    passwordHash: 'hashedpasswordA',
    role: 'user',
    isEmailVerified: true
  });

  userB = await User.create({
    name: 'User B',
    email: 'userb@kevalon.com',
    passwordHash: 'hashedpasswordB',
    role: 'user',
    isEmailVerified: true
  });

  tokenA = generateAccessToken({ userId: userA._id.toString(), email: userA.email, role: userA.role });
  tokenB = generateAccessToken({ userId: userB._id.toString(), email: userB.email, role: userB.role });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

describe('Module 2: Company, Branch & Financial Year Integration Tests', () => {
  let companyAId;
  let branch1Id;
  let branch2Id;
  let fyId;

  // ─── Company Profile Tests ────────────────────────────────────────────────

  describe('POST /api/company (Create Company)', () => {
    it('should successfully create a company and link it to userA', async () => {
      const res = await request(app)
        .post('/api/company')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Kevalon Tech',
          gstin: '27ABCDE1234F1Z5',
          pan: 'ABCDE1234F',
          address: '123 Street',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
          email: 'tech@kevalon.com'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      companyAId = res.body.data._id;

      // Verify that userA's companyId field is updated
      const updatedUser = await User.findById(userA._id);
      expect(updatedUser.companyId.toString()).toBe(companyAId);
    });

    it('should reject company creation with duplicate GSTIN', async () => {
      const res = await request(app)
        .post('/api/company')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Company B',
          gstin: '27ABCDE1234F1Z5', // same gstin
          pan: 'WXYZA1234A',
          address: '456 Lane'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('GSTIN_ALREADY_EXISTS');
    });

    it('should reject company creation with duplicate PAN', async () => {
      const res = await request(app)
        .post('/api/company')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Company B',
          gstin: '27XYZAB1234F1Z5',
          pan: 'ABCDE1234F', // same pan
          address: '456 Lane'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('PAN_ALREADY_EXISTS');
    });

    it('should reject invalid GSTIN, PAN or pincode formats', async () => {
      const res = await request(app)
        .post('/api/company')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Invalid Company',
          gstin: '12345', // invalid
          pan: 'abc', // invalid
          pincode: '00012' // invalid (Indian PIN starts with 1-9)
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('GET /api/company/:id (Get Company Details)', () => {
    it('should allow userA to get company details', async () => {
      const res = await request(app)
        .get(`/api/company/${companyAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Kevalon Tech');
    });

    it('should deny userB from reading userA company details (Data Isolation)', async () => {
      const res = await request(app)
        .get(`/api/company/${companyAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });
  });

  describe('PUT /api/company/:id (Update Company)', () => {
    it('should successfully update company details', async () => {
      const res = await request(app)
        .put(`/api/company/${companyAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Kevalon Enterprise Solutions',
          city: 'Mumbai'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Kevalon Enterprise Solutions');
      expect(res.body.data.city).toBe('Mumbai');
    });
  });

  // ─── Branch Management Tests ──────────────────────────────────────────────

  describe('POST /api/branch (Add Branch)', () => {
    it('should automatically mark first branch as Head Office', async () => {
      const res = await request(app)
        .post('/api/branch')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyAId,
          branchName: 'Pune HQ',
          city: 'Pune',
          isHeadOffice: false // sent as false, should be forced to true
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.isHeadOffice).toBe(true);
      branch1Id = res.body.data._id;
    });

    it('should allow adding a second branch that is not Head Office', async () => {
      const res = await request(app)
        .post('/api/branch')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyAId,
          branchName: 'Mumbai Office',
          city: 'Mumbai',
          isHeadOffice: false
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.isHeadOffice).toBe(false);
      branch2Id = res.body.data._id;
    });

    it('should transfer Head Office status when a new branch is explicitly set as Head Office', async () => {
      const res = await request(app)
        .post('/api/branch')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyAId,
          branchName: 'Delhi HQ Office',
          city: 'Delhi',
          isHeadOffice: true
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.isHeadOffice).toBe(true);

      // Confirm old head office (Pune HQ) was unset
      const oldHO = await Branch.findById(branch1Id);
      expect(oldHO.isHeadOffice).toBe(false);
    });

    it('should deny userB from creating a branch for userA company', async () => {
      const res = await request(app)
        .post('/api/branch')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          companyId: companyAId,
          branchName: 'Illegal Branch'
        });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/branch (List Branches)', () => {
    it('should list all branches for userA company', async () => {
      const res = await request(app)
        .get(`/api/branch?companyId=${companyAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('should deny userB from listing userA branches', async () => {
      const res = await request(app)
        .get(`/api/branch?companyId=${companyAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/branch/:id (Update Branch)', () => {
    it('should prevent manually unsetting isHeadOffice directly if no other Head Office is set', async () => {
      // BranchDelhi is the current Head Office, let's try to set it to false
      const delhiHO = await Branch.findOne({ companyId: companyAId, isHeadOffice: true });

      const res = await request(app)
        .put(`/api/branch/${delhiHO._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          isHeadOffice: false
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.errorCode).toBe('MINIMUM_ONE_HEAD_OFFICE');
    });
  });

  describe('DELETE /api/branch/:id (Delete Branch)', () => {
    it('should successfully delete a non-head-office branch', async () => {
      const res = await request(app)
        .delete(`/api/branch/${branch2Id}`) // branch2 is Mumbai Office (isHeadOffice = false)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Branch removed');
    });

    it('should reject deleting a Head Office branch', async () => {
      const delhiHO = await Branch.findOne({ companyId: companyAId, isHeadOffice: true });

      const res = await request(app)
        .delete(`/api/branch/${delhiHO._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.errorCode).toBe('CANNOT_DELETE_HEAD_OFFICE');
    });
  });

  // ─── Financial Year Tests ─────────────────────────────────────────────────

  describe('POST /api/financial-year (Create Financial Year)', () => {
    it('should successfully create a financial year', async () => {
      const res = await request(app)
        .post('/api/financial-year')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyAId,
          branchId: branch1Id,
          startDate: '2025-04-01',
          endDate: '2026-03-31',
          yearLabel: '2025-26'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.branchId).toBe(branch1Id);
      fyId = res.body.data._id;
    });

    it('should reject a financial year with overlapping date ranges', async () => {
      const res = await request(app)
        .post('/api/financial-year')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyAId,
          branchId: branch1Id,
          startDate: '2025-10-01', // overlaps with existing FY
          endDate: '2026-09-30',
          yearLabel: '2025-26 Overlap'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.errorCode).toBe('FINANCIAL_YEAR_OVERLAP');
    });
  });

  describe('GET /api/financial-year (List Financial Years)', () => {
    it('should successfully list financial years for userA company', async () => {
      const res = await request(app)
        .get(`/api/financial-year?companyId=${companyAId}&branchId=${branch1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should deny userB from listing financial years of userA', async () => {
      const res = await request(app)
        .get(`/api/financial-year?companyId=${companyAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/financial-year/:id/lock (Lock FY)', () => {
    it('should successfully lock a financial year', async () => {
      const res = await request(app)
        .put(`/api/financial-year/${fyId}/lock`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isLocked).toBe(true);
      expect(res.body.data.lockedBy).toBe(userA._id.toString());
      expect(res.body.data.lockedAt).toBeDefined();
    });

    it('should reject locking an already locked financial year', async () => {
      const res = await request(app)
        .put(`/api/financial-year/${fyId}/lock`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.errorCode).toBe('ALREADY_LOCKED');
    });

    it('should deny userB from locking userA financial year', async () => {
      const res = await request(app)
        .put(`/api/financial-year/${fyId}/lock`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });
});
