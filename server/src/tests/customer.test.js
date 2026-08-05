const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const ChartOfAccount = require('../models/ChartOfAccount');
const Customer = require('../models/Customer');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let tokenA;
let tokenB;
let userA;
let userB;
let companyA;
let companyB;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await connectDB(uri);

  // Create test users
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

  // Create companies
  companyA = await Company.create({
    name: 'Company A',
    gstin: '27ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    createdBy: userA._id
  });

  userA.companyId = companyA._id;
  await userA.save();

  companyB = await Company.create({
    name: 'Company B',
    gstin: '27WXYZA1234F1Z5',
    pan: 'WXYZA1234F',
    createdBy: userB._id
  });

  userB.companyId = companyB._id;
  await userB.save();
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

describe('Module 5: Customer Integration Tests', () => {

  describe('Prerequisite Setup', () => {
    it('should seed default COA for company A and company B', async () => {
      // Seed companyA
      let res = await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ companyId: companyA._id.toString() });
      expect(res.statusCode).toBe(201);

      // Seed companyB
      res = await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ companyId: companyB._id.toString() });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('POST /api/customer (Create Customer)', () => {
    const validBillingAddress = {
      line1: 'Flat 101, Residency',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      country: 'India'
    };

    it('should successfully create a customer and link a COA ledger account', async () => {
      const res = await request(app)
        .post('/api/customer')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Acme Corporates',
          gstin: '27ABCDE1234F1Z5',
          email: 'info@acme.com',
          phone: '9876543210',
          billingAddress: validBillingAddress,
          creditLimit: 50000,
          creditPeriodDays: 30
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.name).toBe('Acme Corporates');
      expect(res.body.data.coaAccountId).toBeDefined();

      // Check linked COA Ledger Account
      const coaAccount = await ChartOfAccount.findById(res.body.data.coaAccountId);
      expect(coaAccount).toBeDefined();
      expect(coaAccount.name).toBe('Acme Corporates');
      // Assert it is in the Asset range (1000-1999)
      const codeNum = parseInt(coaAccount.code, 10);
      expect(codeNum).toBeGreaterThanOrEqual(1000);
      expect(codeNum).toBeLessThanOrEqual(1999);
    });

    it('should reject customer creation with a malformed GSTIN format', async () => {
      const res = await request(app)
        .post('/api/customer')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Invalid GSTIN Corp',
          gstin: 'INVALIDGSTIN12',
          billingAddress: validBillingAddress
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid GSTIN');
    });

    it('should reject customer creation with duplicate GSTIN in same company', async () => {
      const res = await request(app)
        .post('/api/customer')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Acme Corporates Alternate',
          gstin: '27ABCDE1234F1Z5', // duplicate of first test
          billingAddress: validBillingAddress
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('GSTIN already exists');
    });

    it('should allow same GSTIN in two different companies', async () => {
      const res = await request(app)
        .post('/api/customer')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          companyId: companyB._id.toString(),
          name: 'Acme Branch Company B',
          gstin: '27ABCDE1234F1Z5', // duplicate from company A but different company
          billingAddress: validBillingAddress
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should automatically duplicate billingAddress to shippingAddress if shippingAddress omitted', async () => {
      const res = await request(app)
        .post('/api/customer')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Acme Billing Copy Test',
          billingAddress: validBillingAddress
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.shippingAddress).toEqual(res.body.data.billingAddress);
    });
  });

  describe('GET /api/customer (List/Search & Pagination)', () => {
    it('should list active customers with pagination details', async () => {
      const res = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('should filter search queries matching name', async () => {
      const res = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}&search=Acme`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].name).toContain('Acme');
    });

    it('should block cross-company customer list requests', async () => {
      const res = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/customer/:id (Get Details)', () => {
    it('should retrieve customer details with computed currentBalance', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data[0];

      const res = await request(app)
        .get(`/api/customer/${target._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentBalance).toBe(0); // opening balance placeholder
    });

    it('should deny cross-company customer detail requests', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data[0];

      const res = await request(app)
        .get(`/api/customer/${target._id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/customer/:id (Update Customer)', () => {
    it('should successfully update customer details and sync name to COA account', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data.find(c => c.name === 'Acme Corporates');

      const res = await request(app)
        .put(`/api/customer/${target._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Acme Enterprises Inc'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Acme Enterprises Inc');

      // Verify sync to COA
      const coaAccount = await ChartOfAccount.findById(target.coaAccountId);
      expect(coaAccount.name).toBe('Acme Enterprises Inc');
    });

    it('should reject updating coaAccountId (immutable field)', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data[0];

      const res = await request(app)
        .put(`/api/customer/${target._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          coaAccountId: companyB._id.toString() // attempt to edit
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('cannot be changed');
    });
  });

  describe('GET /api/customer/:id/ledger & /invoices', () => {
    it('should return placeholder ledger transactions details', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data[0];

      const res = await request(app)
        .get(`/api/customer/${target._id}/ledger`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customerId).toBe(target._id);
      expect(res.body.data.transactions).toBeInstanceOf(Array);
    });

    it('should return placeholder empty array for invoices', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data[0];

      const res = await request(app)
        .get(`/api/customer/${target._id}/invoices`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('DELETE /api/customer/:id (Deactivate Customer)', () => {
    it('should soft delete/deactivate customer and linked COA account', async () => {
      const listRes = await request(app)
        .get(`/api/customer?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const target = listRes.body.data.find(c => c.name === 'Acme Billing Copy Test');

      const res = await request(app)
        .delete(`/api/customer/${target._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Customer deactivated');

      // Verify database state is isActive: false
      const dbCust = await Customer.findById(target._id);
      expect(dbCust.isActive).toBe(false);

      const dbCoa = await ChartOfAccount.findById(target.coaAccountId);
      expect(dbCoa.isActive).toBe(false);
    });
  });
});
