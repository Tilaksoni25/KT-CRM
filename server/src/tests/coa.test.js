const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const ChartOfAccount = require('../models/ChartOfAccount');
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

describe('Module 3: Chart of Accounts (COA) Integration Tests', () => {
  
  describe('POST /api/coa/seed-default', () => {
    it('should successfully seed default COA for companyA', async () => {
      const res = await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ companyId: companyA._id.toString() });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(24); // seeded count

      // Verify that system accounts exist
      const accounts = await ChartOfAccount.find({ companyId: companyA._id, isSystemAccount: true });
      expect(accounts.length).toBe(24);
    });

    it('should reject duplicate seeding of default COA', async () => {
      const res = await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ companyId: companyA._id.toString() });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Default COA already seeded');
    });

    it('should deny userB from seeding companyA default COA (Data Isolation)', async () => {
      const res = await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ companyId: companyA._id.toString() });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/coa (Create Account)', () => {
    let currentAssetsGroup;
    let bankAccountsGroup;
    let cashLedger;

    beforeAll(async () => {
      currentAssetsGroup = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Current Assets' });
      bankAccountsGroup = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Bank Accounts' });
      cashLedger = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Cash-in-Hand' });
    });

    it('should successfully create a custom ledger account under a valid group', async () => {
      const res = await request(app)
        .post('/api/coa')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'HDFC Bank - Current A/c',
          type: 'Asset',
          isGroup: false,
          parentId: bankAccountsGroup._id.toString(),
          openingBalance: 5000,
          openingBalanceType: 'Dr'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('HDFC Bank - Current A/c');
      expect(res.body.data.parentId.toString()).toBe(bankAccountsGroup._id.toString());
      expect(res.body.data.isSystemAccount).toBe(false);
      expect(res.body.data.code).toBeDefined(); // should be auto-generated
    });

    it('should reject creation where parent/child types mismatch', async () => {
      const currentLiabilitiesGroup = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Current Liabilities' });
      
      const res = await request(app)
        .post('/api/coa')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Invalid Type Account',
          type: 'Asset', // Child is Asset
          isGroup: false,
          parentId: currentLiabilitiesGroup._id.toString() // Parent is Liability
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('does not match child type');
    });

    it('should reject creation under a ledger account (isGroup: false)', async () => {
      const res = await request(app)
        .post('/api/coa')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Petty Cash Child',
          type: 'Asset',
          isGroup: false,
          parentId: cashLedger._id.toString() // parent is a ledger, not a group
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('must be a group account');
    });

    it('should reject if parent belongs to a different company', async () => {
      // Seed company B so it has accounts
      await request(app)
        .post('/api/coa/seed-default')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ companyId: companyB._id.toString() });
      const companyBAssets = await ChartOfAccount.findOne({ companyId: companyB._id, name: 'Assets' });

      const res = await request(app)
        .post('/api/coa')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Cross Tenant Account',
          type: 'Asset',
          isGroup: false,
          parentId: companyBAssets._id.toString()
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('same company');
    });
  });

  describe('GET /api/coa', () => {
    it('should list all accounts for companyA sorted by code flatly', async () => {
      const res = await request(app)
        .get(`/api/coa?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(24); // seeded + custom
      
      // Verify sorting by code ascending
      const codes = res.body.data.map(acc => parseInt(acc.code));
      for (let i = 0; i < codes.length - 1; i++) {
        if (!isNaN(codes[i]) && !isNaN(codes[i+1])) {
          expect(codes[i]).toBeLessThanOrEqual(codes[i+1]);
        }
      }
    });

    it('should list accounts as recursively nested tree structure when asTree=true', async () => {
      const res = await request(app)
        .get(`/api/coa?companyId=${companyA._id.toString()}&asTree=true`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      
      // Top-level groups should have parentId = null
      res.body.data.forEach(rootNode => {
        expect(rootNode.parentId).toBeNull();
        expect(rootNode.isGroup).toBe(true);
        expect(rootNode.children).toBeDefined();
      });
    });

    it('should deny userB from reading userA accounts list', async () => {
      const res = await request(app)
        .get(`/api/coa?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/coa/:id', () => {
    let testAccount;

    beforeAll(async () => {
      testAccount = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Cash-in-Hand' });
    });

    it('should get single account details with currentBalance computed', async () => {
      const res = await request(app)
        .get(`/api/coa/${testAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Cash-in-Hand');
      expect(res.body.data.currentBalance).toBeDefined();
    });

    it('should deny userB from getting details of userA account', async () => {
      const res = await request(app)
        .get(`/api/coa/${testAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/coa/:id (Update Account)', () => {
    let systemAccount;
    let customAccount;

    beforeAll(async () => {
      systemAccount = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Cash-in-Hand' });
      customAccount = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'HDFC Bank - Current A/c' });
    });

    it('should reject updating type or isGroup', async () => {
      const res = await request(app)
        .put(`/api/coa/${customAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ type: 'Liability' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('type and isGroup cannot be changed');
    });

    it('should reject renaming or altering code of a system account', async () => {
      const res = await request(app)
        .put(`/api/coa/${systemAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Renamed Cash', code: '1999' });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('default accounts cannot be deleted or renamed');
    });

    it('should allow toggling active status on system accounts', async () => {
      const res = await request(app)
        .put(`/api/coa/${systemAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ isActive: false });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Restore active status
      await ChartOfAccount.findByIdAndUpdate(systemAccount._id, { isActive: true });
    });

    it('should successfully update name and code of custom accounts', async () => {
      const res = await request(app)
        .put(`/api/coa/${customAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'HDFC Bank - Active A/c' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('HDFC Bank - Active A/c');
    });
  });

  describe('DELETE /api/coa/:id (Delete Account)', () => {
    let systemAccount;
    let customGroup;
    let customChild;
    let customAccount;

    beforeAll(async () => {
      systemAccount = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'Cash-in-Hand' });
      customAccount = await ChartOfAccount.findOne({ companyId: companyA._id, name: 'HDFC Bank - Active A/c' });
      
      customGroup = await ChartOfAccount.create({
        companyId: companyA._id,
        name: 'Custom Group Expense',
        type: 'Expense',
        isGroup: true,
        code: '5800'
      });
      
      customChild = await ChartOfAccount.create({
        companyId: companyA._id,
        name: 'Custom Child Expense',
        type: 'Expense',
        isGroup: false,
        parentId: customGroup._id,
        code: '5801'
      });
    });

    it('should reject deleting a system account', async () => {
      const res = await request(app)
        .delete(`/api/coa/${systemAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('default accounts cannot be deleted');
    });

    it('should reject deleting a group account with children', async () => {
      const res = await request(app)
        .delete(`/api/coa/${customGroup._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot delete group account with child accounts');
    });

    it('should successfully soft-delete a custom ledger account', async () => {
      const res = await request(app)
        .delete(`/api/coa/${customAccount._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await ChartOfAccount.findById(customAccount._id);
      expect(deleted.isActive).toBe(false);
    });
  });
});
