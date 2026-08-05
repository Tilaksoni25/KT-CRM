const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Tax = require('../models/Tax');
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

  userA = await User.create({
    name: 'User A',
    email: 'usera-gst@kevalon.com',
    passwordHash: 'hashedpasswordA',
    role: 'user',
    isEmailVerified: true
  });

  userB = await User.create({
    name: 'User B',
    email: 'userb-gst@kevalon.com',
    passwordHash: 'hashedpasswordB',
    role: 'user',
    isEmailVerified: true
  });

  tokenA = generateAccessToken({ userId: userA._id.toString(), email: userA.email, role: userA.role });
  tokenB = generateAccessToken({ userId: userB._id.toString(), email: userB.email, role: userB.role });

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

describe('Module 25: GST & Tax Master Integration Tests', () => {

  describe('POST /api/tax/seed-default', () => {
    it('should successfully seed 9 default tax rates for company A', async () => {
      const res = await request(app)
        .post('/api/tax/seed-default')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ companyId: companyA._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(9);

      const dbTaxes = await Tax.find({ companyId: companyA._id });
      expect(dbTaxes.length).toBe(9);
      dbTaxes.forEach((t) => {
        expect(t.isSystemTax).toBe(true);
        expect(t.isActive).toBe(true);
      });
    });

    it('should reject seeding duplicate default tax rates (idempotency)', async () => {
      const res = await request(app)
        .post('/api/tax/seed-default')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ companyId: companyA._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already seeded');
    });

    it('should allow seeding for company B separately', async () => {
      const res = await request(app)
        .post('/api/tax/seed-default')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ companyId: companyB._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body.data.count).toBe(9);
    });
  });

  describe('POST /api/tax (Create Custom Tax Rate)', () => {
    it('should create a custom tax rate successfully', async () => {
      const res = await request(app)
        .post('/api/tax')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'Custom GST 15%',
          ratePercent: 15,
          taxCategory: 'Taxable',
          hsnSacApplicable: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Custom GST 15%');
      expect(res.body.data.isSystemTax).toBe(false);
    });

    it('should reject creating a duplicate tax rate name (case-insensitive) in the same company', async () => {
      const res = await request(app)
        .post('/api/tax')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          companyId: companyA._id.toString(),
          name: 'custom gst 15%',
          ratePercent: 15,
          taxCategory: 'Taxable'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('DUPLICATE_TAX_NAME');
    });

    it('should allow same tax rate name in two different companies', async () => {
      const res = await request(app)
        .post('/api/tax')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          companyId: companyB._id.toString(),
          name: 'Custom GST 15%',
          ratePercent: 15,
          taxCategory: 'Taxable'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/tax (List Tax Rates)', () => {
    it('should list active tax rates sorted by ratePercent ascending', async () => {
      const res = await request(app)
        .get(`/api/tax?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(10); // 9 seeded + 1 custom

      // Verify sorted order
      const rates = res.body.data.map((r) => r.ratePercent);
      const sortedRates = [...rates].sort((a, b) => a - b);
      expect(rates).toEqual(sortedRates);
    });

    it('should deny listing company A tax rates to company B user', async () => {
      const res = await request(app)
        .get(`/api/tax?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/gst/validate-gstin', () => {
    it('should return isValid true for a fully valid GSTIN with correct checksum', async () => {
      // 27GSPDE1234F1ZI checksum character: I
      const res = await request(app)
        .post('/api/gst/validate-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: '27GSPDE1234F1ZI' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.isValidFormat).toBe(true);
      expect(res.body.data.isChecksumValid).toBe(true);
      expect(res.body.data.stateCode).toBe('27');
      expect(res.body.data.panEmbedded).toBe('GSPDE1234F');
    });

    it('should return isValid false and isChecksumValid false for a correct format but wrong checksum character', async () => {
      const res = await request(app)
        .post('/api/gst/validate-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: '27GSPDE1234F1Z8' }); // wrong check digit

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.isValidFormat).toBe(true);
      expect(res.body.data.isChecksumValid).toBe(false);
    });

    it('should return isValid false and isValidFormat false for a completely malformed GSTIN format', async () => {
      const res = await request(app)
        .post('/api/gst/validate-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: 'INVALID123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.isValidFormat).toBe(false);
      expect(res.body.data.isChecksumValid).toBe(false);
    });
  });

  describe('GET /api/gst/returns-summary', () => {
    it('should return the zeroed-out returns summary shape successfully', async () => {
      const res = await request(app)
        .get(`/api/gst/returns-summary?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('period');
      expect(res.body.data.outputTax.total).toBe(0);
      expect(res.body.data.inputTax.total).toBe(0);
      expect(res.body.data.netPayable).toBe(0);
    });

    it('should deny returns summary to unauthorized company user', async () => {
      const res = await request(app)
        .get(`/api/gst/returns-summary?companyId=${companyA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });
  });
});
