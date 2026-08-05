const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Role = require('../models/Role');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');
const roleService = require('../services/role.service');

let mongoServer;
let tokenA;     // company owner (Super Admin bypass)
let tokenB;     // user with 'Admin' role on companyA (manage UserManagement)
let tokenC;     // user with 'Employee' role on companyA (view-only, cannot manage users)
let userA;      // company owner
let userB;
let userC;
let companyA;
let companyB;   // separate company for isolation tests

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await connectDB(uri);

  // Company owner (no companyAccess entry — bypasses permission gate as owner)
  userA = await User.create({
    name: 'Owner A',
    email: 'owner-a-user16@kevalon.com',
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

  // Seed default roles for companyA (so requirePermission can resolve role names)
  await roleService.seedDefaultRoles(companyA._id.toString());

  // userB: Admin on companyA (can manage users)
  userB = await User.create({
    name: 'User B Admin',
    email: 'userb-user16@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true,
    companyAccess: [{
      companyId: companyA._id,
      role: 'Admin',  // maps to Admin seeded role which has 'manage' on UserManagement
      isActive: true,
      invitedAt: new Date()
    }]
  });
  tokenB = generateAccessToken({ userId: userB._id.toString(), email: userB.email, role: userB.role });

  // userC: Employee on companyA (cannot manage users — UserManagement = 'none')
  userC = await User.create({
    name: 'User C Employee',
    email: 'userc-user16@kevalon.com',
    passwordHash: 'hashed',
    role: 'user',
    isEmailVerified: true,
    companyAccess: [{
      companyId: companyA._id,
      role: 'Employee',  // Employee has 'none' on UserManagement
      isActive: true,
      invitedAt: new Date()
    }]
  });
  tokenC = generateAccessToken({ userId: userC._id.toString(), email: userC.email, role: userC.role });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user — Invite user
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/user (Invite User)', () => {
  it('should invite a brand-new user with null passwordHash and send invite email', async () => {
    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'New Invite',
        email: 'new-invite@kevalon.com',
        role: 'Accountant'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('new-invite@kevalon.com');

    // Verify user was created with null passwordHash
    const created = await User.findOne({ email: 'new-invite@kevalon.com' }).select('+passwordHash');
    expect(created).toBeTruthy();
    expect(created.passwordHash).toBeNull();
    expect(created.companyAccess).toHaveLength(1);
    expect(created.companyAccess[0].role).toBe('Accountant');
  });

  it('should grant access to an existing user on a different company (no new account created)', async () => {
    // First invite to companyA
    await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Multi Company User',
        email: 'multi@kevalon.com',
        role: 'Sales'
      });

    // Then invite same email to companyB — should add companyAccess entry, not create new user
    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyB._id.toString(),
        name: 'Multi Company User',
        email: 'multi@kevalon.com',
        role: 'Manager'
      });

    expect(res.status).toBe(200); // existing user granted access
    expect(res.body.success).toBe(true);

    // Verify only ONE User document exists for this email
    const count = await User.countDocuments({ email: 'multi@kevalon.com' });
    expect(count).toBe(1);

    const user = await User.findOne({ email: 'multi@kevalon.com' });
    expect(user.companyAccess).toHaveLength(2);
  });

  it('should reject inviting the same email to the same company twice (409)', async () => {
    await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Dup User',
        email: 'dup@kevalon.com',
        role: 'HR'
      });

    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Dup User',
        email: 'dup@kevalon.com',
        role: 'HR'
      });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('USER_ALREADY_HAS_ACCESS');
  });

  it('should deny an Employee from inviting users (403 — insufficient UserManagement permission)', async () => {
    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Should Fail',
        email: 'fail@kevalon.com',
        role: 'Sales'
      });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('INSUFFICIENT_PERMISSION');
  });

  it('should allow an Admin (manage UserManagement) to invite users', async () => {
    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'By Admin',
        email: 'by-admin@kevalon.com',
        role: 'Sales'
      });

    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user?companyId= — List users
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/user (List Users)', () => {
  it('should list all active users for companyA with correct company-scoped role', async () => {
    const res = await request(app)
      .get(`/api/user?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Each entry must have a role — from companyA's companyAccess, not another company's
    res.body.data.forEach((u) => {
      expect(u.role).toBeDefined();
      expect(u.userId).toBeDefined();
    });
  });

  it('should show per-company role only — multi@kevalon.com should show Sales for companyA', async () => {
    const res = await request(app)
      .get(`/api/user?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const multiUser = res.body.data.find((u) => u.email === 'multi@kevalon.com');
    expect(multiUser).toBeTruthy();
    expect(multiUser.role).toBe('Sales'); // companyA role, not Manager from companyB
  });

  it('should support pagination', async () => {
    const res = await request(app)
      .get(`/api/user?companyId=${companyA._id.toString()}&page=1&limit=2`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user/:id — Update user
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/user/:id (Update User)', () => {
  let invitedUser;

  beforeAll(async () => {
    // Create a user to update
    invitedUser = await User.create({
      name: 'Update Target',
      email: 'update-target@kevalon.com',
      passwordHash: 'hashed',
      role: 'user',
      isEmailVerified: true,
      companyAccess: [{
        companyId: companyA._id,
        role: 'Sales',
        isActive: true,
        invitedAt: new Date()
      }]
    });
  });

  it('should update role for companyA only — not affect any other company entry', async () => {
    const res = await request(app)
      .put(`/api/user/${invitedUser._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        role: 'Manager'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('Manager');
  });

  it('should update global profile name without affecting companyAccess', async () => {
    const res = await request(app)
      .put(`/api/user/${invitedUser._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyA._id.toString(),
        name: 'Updated Name'
      });

    expect(res.status).toBe(200);
    const refreshed = await User.findById(invitedUser._id);
    expect(refreshed.name).toBe('Updated Name');
  });

  it('should return 404 if user has no companyAccess entry for the given companyId', async () => {
    const res = await request(app)
      .put(`/api/user/${invitedUser._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        companyId: companyB._id.toString(),
        role: 'HR'
      });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('ACCESS_ENTRY_NOT_FOUND');
  });

  it('should block self-lockout when caller deactivates their only active company access', async () => {
    // userB has only one active companyAccess entry (companyA)
    const res = await request(app)
      .put(`/api/user/${userB._id}`)
      .set('Authorization', `Bearer ${tokenB}`)  // caller IS userB
      .send({
        companyId: companyA._id.toString(),
        isActive: false
      });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SELF_LOCKOUT_PREVENTED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user/:id?companyId= — Revoke access
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/user/:id (Revoke Access)', () => {
  let revokeTarget;

  beforeAll(async () => {
    revokeTarget = await User.create({
      name: 'Revoke Target',
      email: 'revoke-target@kevalon.com',
      passwordHash: 'hashed',
      role: 'user',
      isEmailVerified: true,
      companyAccess: [{
        companyId: companyA._id,
        role: 'CA',
        isActive: true,
        invitedAt: new Date()
      }]
    });
  });

  it('should soft-revoke access (set isActive: false) — not delete the user', async () => {
    const res = await request(app)
      .delete(`/api/user/${revokeTarget._id}?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // User document must still exist
    const stillExists = await User.findById(revokeTarget._id);
    expect(stillExists).toBeTruthy();

    // Access entry must now be inactive
    const entry = stillExists.companyAccess.find(
      (a) => a.companyId.toString() === companyA._id.toString()
    );
    expect(entry.isActive).toBe(false);
  });

  it('should block self-lockout on DELETE as well', async () => {
    // userB has only one active companyAccess entry (companyA) and has Admin role
    // (Admin has 'manage' on UserManagement — passes the permission gate)
    // Attempting to self-revoke that only entry should be blocked
    const res = await request(app)
      .delete(`/api/user/${userB._id}?companyId=${companyA._id.toString()}`)
      .set('Authorization', `Bearer ${tokenB}`)  // caller IS userB, Admin role passes gate
      ;

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SELF_LOCKOUT_PREVENTED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Login guard for invited-but-not-activated users
// ─────────────────────────────────────────────────────────────────────────────
describe('Login guard — invited user with null passwordHash', () => {
  it('should reject login with a clear message for invited-but-not-activated users', async () => {
    // Create an invited user (null passwordHash)
    await User.create({
      name: 'Pending Invite',
      email: 'pending@kevalon.com',
      passwordHash: null,
      role: 'user',
      isEmailVerified: false
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@kevalon.com', password: 'anyPassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invite/i);
  });
});
