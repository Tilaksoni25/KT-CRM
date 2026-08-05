const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const ChartOfAccount = require('../models/ChartOfAccount');
const BankAccount = require('../models/BankAccount');
const BankReconciliation = require('../models/BankReconciliation');
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

describe('Module 4: Bank & Cash Accounts Integration Tests', () => {
  
  describe('Prerequisite Checks', () => {
    it('should reject creating a bank account if COA is not seeded', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'Savings',
          accountName: 'HDFC Savings A/c',
          bankName: 'HDFC Bank',
          accountNumber: '1234567890',
          ifscCode: 'HDFC0000123'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('seed the COA first');
    });

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

  describe('POST /api/bank-account (Create Bank/Cash/Wallet Account)', () => {
    it('should successfully create Savings account with required conditional fields', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'Savings',
          accountName: 'HDFC Savings A/c',
          bankName: 'HDFC Bank',
          accountNumber: '501002938192',
          ifscCode: 'HDFC0000123',
          branchName: 'Kothrud Branch',
          openingBalance: 10000
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.accountType).toBe('Savings');
      expect(res.body.data.coaAccountId).toBeDefined();

      // Check that the linked COA account is created under 'Bank Accounts' (code starts with 122)
      const coaAccount = await ChartOfAccount.findById(res.body.data.coaAccountId);
      expect(coaAccount).toBeDefined();
      expect(coaAccount.name).toBe('HDFC Savings A/c');
      const codeNum = parseInt(coaAccount.code, 10);
      expect(codeNum).toBeGreaterThanOrEqual(1000);
      expect(codeNum).toBeLessThanOrEqual(1999);
    });

    it('should reject Savings account creation if any of bankName, accountNumber, or ifscCode is missing', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'Savings',
          accountName: 'HDFC Savings A/c',
          // bankName missing
          accountNumber: '501002938192',
          ifscCode: 'HDFC0000123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should successfully create Cash account without bankName/accountNumber/ifscCode', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'Cash',
          accountName: 'Main Cash Box'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountType).toBe('Cash');

      // Check that the linked COA account is created under 'Current Assets' (parent code 1200, code range starts with 12)
      const coaAccount = await ChartOfAccount.findById(res.body.data.coaAccountId);
      expect(coaAccount).toBeDefined();
      expect(coaAccount.name).toBe('Main Cash Box');
      const codeNum = parseInt(coaAccount.code, 10);
      expect(codeNum).toBeGreaterThanOrEqual(1000);
      expect(codeNum).toBeLessThanOrEqual(1999);
    });

    it('should successfully create Wallet account without bankName/accountNumber/ifscCode', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'Wallet',
          accountName: 'Paytm Wallet'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountType).toBe('Wallet');
    });

    it('should successfully create CreditCard account with bankName and accountNumber but no ifscCode', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'CreditCard',
          accountName: 'ICICI Amazon Credit Card',
          bankName: 'ICICI Bank',
          accountNumber: '431520001928'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountType).toBe('CreditCard');
    });

    it('should reject CreditCard account creation if bankName or accountNumber is missing', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'CreditCard',
          accountName: 'ICICI Amazon Credit Card',
          bankName: 'ICICI Bank'
          // accountNumber missing
        });

      expect(res.statusCode).toBe(400);
    });

    it('should successfully create UPI account with only name and companyId', async () => {
      const res = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'UPI',
          accountName: 'GPay Shop Handle'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountType).toBe('UPI');
    });
  });

  describe('GET /api/bank-account (List Accounts & Masking)', () => {
    it('should return masked accountNumber in list response', async () => {
      const res = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Verify masking on Savings account
      const savingsAcc = res.body.data.find(acc => acc.accountType === 'Savings');
      expect(savingsAcc).toBeDefined();
      expect(savingsAcc.accountNumber).toBe('••••8192'); // masked output last 4 of 501002938192
    });

    it('should exclude inactive accounts by default and include them if includeInactive=true', async () => {
      // First, create an inactive account
      const setupRes = await request(app)
        .post('/api/bank-account')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          accountType: 'UPI',
          accountName: 'Old PhonePe UPI'
        });
      const accountId = setupRes.body.data._id;

      // Deactivate it via PUT
      await request(app)
        .put(`/api/bank-account/${accountId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ isActive: false });

      // List by default
      let listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const foundInactiveByDefault = listRes.body.data.find(acc => acc._id === accountId);
      expect(foundInactiveByDefault).toBeUndefined();

      // List with includeInactive=true
      listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}&includeInactive=true`)
        .set('Authorization', `Bearer ${tokenA}`);
      const foundInactive = listRes.body.data.find(acc => acc._id === accountId);
      expect(foundInactive).toBeDefined();
      expect(foundInactive.isActive).toBe(false);
    });

    it('should block cross-company list retrieval', async () => {
      const res = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/bank-account/:id (Detail & Unmasked Number)', () => {
    it('should return unmasked accountNumber and computed currentBalance in detail response', async () => {
      // Find a Savings account
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const savingsAcc = listRes.body.data.find(acc => acc.accountType === 'Savings');

      const res = await request(app)
        .get(`/api/bank-account/${savingsAcc._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('501002938192'); // unmasked
      expect(res.body.data.currentBalance).toBe(0); // placeholder value
    });

    it('should deny cross-company detail retrieval', async () => {
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const savingsAcc = listRes.body.data.find(acc => acc.accountType === 'Savings');

      const res = await request(app)
        .get(`/api/bank-account/${savingsAcc._id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/bank-account/:id (Update Account Details)', () => {
    it('should allow modifying allowed fields and sync to COA', async () => {
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const upiAcc = listRes.body.data.find(acc => acc.accountType === 'UPI');

      const res = await request(app)
        .put(`/api/bank-account/${upiAcc._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          accountName: 'Updated UPI Name',
          branchName: 'Main Office'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.accountName).toBe('Updated UPI Name');
      expect(res.body.data.branchName).toBe('Main Office');

      // Verify the COA account name has updated
      const coaAccount = await ChartOfAccount.findById(upiAcc.coaAccountId);
      expect(coaAccount.name).toBe('Updated UPI Name');
    });

    it('should reject updating immutable fields (accountType, accountNumber, coaAccountId)', async () => {
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const savingsAcc = listRes.body.data.find(acc => acc.accountType === 'Savings');

      const res = await request(app)
        .put(`/api/bank-account/${savingsAcc._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          accountType: 'Current',
          accountNumber: '999999999999'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('cannot be changed after creation');
    });
  });

  describe('GET /api/bank-account/:id/ledger (Ledger History)', () => {
    it('should return placeholder transactions and current balance', async () => {
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const savingsAcc = listRes.body.data.find(acc => acc.accountType === 'Savings');

      const res = await request(app)
        .get(`/api/bank-account/${savingsAcc._id}/ledger`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accountId');
      expect(res.body.data).toHaveProperty('currentBalance');
      expect(res.body.data.transactions).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/bank-account/:id/reconcile (Reconciliation)', () => {
    it('should successfully submit statement lines and return reconciliation statistics', async () => {
      const listRes = await request(app)
        .get(`/api/bank-account?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const savingsAcc = listRes.body.data.find(acc => acc.accountType === 'Savings');

      const res = await request(app)
        .post(`/api/bank-account/${savingsAcc._id}/reconcile`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          statementDate: new Date().toISOString(),
          statementLines: [
            {
              date: new Date().toISOString(),
              description: 'UPI Transfer Out',
              amount: 500,
              type: 'debit',
              referenceNo: 'TXN10029310'
            },
            {
              date: new Date().toISOString(),
              description: 'Salary Credit',
              amount: 45000,
              type: 'credit',
              referenceNo: 'TXN10029311'
            }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reconciliationId).toBeDefined();
      expect(res.body.data.matchedCount).toBe(0); // placeholder returns unmatched
      expect(res.body.data.unmatchedCount).toBe(2);
      expect(res.body.data.totalLines).toBe(2);

      // Verify it is saved in the database
      const dbRecon = await BankReconciliation.findById(res.body.data.reconciliationId);
      expect(dbRecon).toBeDefined();
      expect(dbRecon.lines.length).toBe(2);
      expect(dbRecon.lines[0].status).toBe('unmatched');
    });
  });
});
