const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Role = require('../models/Role');
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
    email: 'usera-role@kevalon.com',
    passwordHash: 'hashedA',
    role: 'user',
    isEmailVerified: true
  });

  userB = await User.create({
    name: 'User B',
    email: 'userb-role@kevalon.com',
    passwordHash: 'hashedB',
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/role/seed-default
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/role/seed-default', () => {
  it('should seed exactly 8 default roles with Super Admin protected', async () => {
    const res = await request(app)
      .post('/api/role/seed-default')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ companyId: companyA._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(8);
    expect(res.body.data.ids).toHaveLength(8);

    // Verify Super Admin is protected
    const superAdmin = await Role.findOne({ companyId: companyA._id, name: 'Super Admin' });
    expect(superAdmin).toBeTruthy();
    expect(superAdmin.isSystemRole).toBe(true);
    expect(superAdmin.isProtected).toBe(true);

    // Verify all other system roles are NOT protected
    const otherSystem = await Role.find({
      companyId: companyA._id,
      isSystemRole: true,
      name: { $ne: 'Super Admin' }
    });
    otherSystem.forEach((role) => {
      expect(role.isProtected).toBe(false);
    });

    // Verify every role has exactly 15 permissions
    const allRoles = await Role.find({ companyId: companyA._id });
    allRoles.forEach((role) => {
      expect(role.permissions).toHaveLength(15);
    });
  });

  it('should reject seeding if default roles already exist (idempotency)', async () => {
    const res = await request(app)
      .post('/api/role/seed-default')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ companyId: companyA._id.toString() });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already seeded/i);
  });

  it('should allow seeding for a second company independently', async () => {
    const res = await request(app)
      .post('/api/role/seed-default')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ companyId: companyB._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.count).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/role — Create custom role
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/role (Create Custom Role)', () => {
  it('should create a custom role with partial permissions (missing modules default to none)', async () => {
    const res = await request(app)
      .post('/api/role')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Inventory Manager',
        description: 'Handles stock only',
        permissions: [
          { module: 'Inventory', level: 'full' },
          { module: 'Purchase', level: 'view' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Inventory Manager');
    expect(res.body.data.isSystemRole).toBe(false);
    expect(res.body.data.isProtected).toBe(false);
    expect(res.body.data.permissions).toHaveLength(15);

    // Inventory should be 'full', others without entry should be 'none'
    const invPerm = res.body.data.permissions.find((p) => p.module === 'Inventory');
    expect(invPerm.level).toBe('full');
    const crmPerm = res.body.data.permissions.find((p) => p.module === 'CRM');
    expect(crmPerm.level).toBe('none');
  });

  it('should reject creating a role with a duplicate name (case-insensitive) in the same company', async () => {
    const res = await request(app)
      .post('/api/role')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'INVENTORY MANAGER', // same as "Inventory Manager", different case
        permissions: []
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('ROLE_NAME_CONFLICT');
  });

  it('should allow the same role name across two different companies', async () => {
    const res = await request(app)
      .post('/api/role')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        companyId: companyB._id.toString(),
        name: 'Inventory Manager', // same name but for companyB
        permissions: []
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject an unknown module key in the permissions array with 400', async () => {
    const res = await request(app)
      .post('/api/role')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Bad Role',
        permissions: [
          { module: 'NonExistentModule', level: 'full' }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject an unknown level value in the permissions array with 400', async () => {
    const res = await request(app)
      .post('/api/role')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Bad Level Role',
        permissions: [
          { module: 'Accounting', level: 'superpower' }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/role?companyId=
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/role (List Roles)', () => {
  it('should return all roles sorted system-first then custom alphabetically', async () => {
    const res = await request(app)
      .get(`/api/role?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const names = res.body.data.map((r) => r.name);
    const systemOrder = ['Super Admin', 'Admin', 'Accountant', 'CA', 'Manager', 'Sales', 'HR', 'Employee'];

    // First 8 must be system roles in spec order
    expect(names.slice(0, 8)).toEqual(systemOrder);

    // Custom roles come after
    const customRoles = res.body.data.filter((r) => !r.isSystemRole);
    expect(customRoles.length).toBeGreaterThan(0);
    expect(customRoles[0].name).toBe('Inventory Manager');
  });

  it('should deny userB from listing userA company roles (data isolation)', async () => {
    const res = await request(app)
      .get(`/api/role?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/role/:id/permissions
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/role/:id/permissions (Update Permissions)', () => {
  let adminRole;
  let superAdminRole;

  beforeAll(async () => {
    adminRole = await Role.findOne({ companyId: companyA._id, name: 'Admin' });
    superAdminRole = await Role.findOne({ companyId: companyA._id, name: 'Super Admin' });
  });

  it('should allow editing a non-protected system role (Admin)', async () => {
    const res = await request(app)
      .put(`/api/role/${adminRole._id}/permissions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        permissions: [
          { module: 'AuditLog', level: 'full' }   // was 'view', now 'full'
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const auditPerm = res.body.data.permissions.find((p) => p.module === 'AuditLog');
    expect(auditPerm.level).toBe('full');

    // Other modules should be unchanged
    const coaPerm = res.body.data.permissions.find((p) => p.module === 'Accounting');
    expect(coaPerm.level).toBe('full'); // Admin's Accounting level was 'full'
  });

  it('should reject editing the Super Admin role (isProtected) with 403', async () => {
    const res = await request(app)
      .put(`/api/role/${superAdminRole._id}/permissions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        permissions: [
          { module: 'AuditLog', level: 'none' }
        ]
      });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ROLE_PROTECTED');
  });

  it('should reject an unknown module key in permissions update with 400', async () => {
    const res = await request(app)
      .put(`/api/role/${adminRole._id}/permissions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        permissions: [
          { module: 'FakeModule', level: 'view' }
        ]
      });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/role/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/role/:id', () => {
  let superAdminRole;
  let customRole;

  beforeAll(async () => {
    superAdminRole = await Role.findOne({ companyId: companyA._id, name: 'Super Admin' });
    customRole = await Role.findOne({ companyId: companyA._id, name: 'Inventory Manager' });
  });

  it('should reject deleting a system role (any isSystemRole: true) with 403', async () => {
    const hr = await Role.findOne({ companyId: companyA._id, name: 'HR' });
    const res = await request(app)
      .delete(`/api/role/${hr._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SYSTEM_ROLE_PROTECTED');
  });

  it('should reject deleting the Super Admin role with 403', async () => {
    const res = await request(app)
      .delete(`/api/role/${superAdminRole._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SYSTEM_ROLE_PROTECTED');
  });

  it('should successfully delete an unused custom role', async () => {
    const res = await request(app)
      .delete(`/api/role/${customRole._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleted = await Role.findById(customRole._id);
    expect(deleted).toBeNull();
  });

  it('should return 404 for a deleted role', async () => {
    const res = await request(app)
      .delete(`/api/role/${customRole._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});
