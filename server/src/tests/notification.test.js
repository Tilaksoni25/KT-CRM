const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Notification = require('../models/Notification');
const Alert = require('../models/Alert');
const Role = require('../models/Role');
const { PERMISSION_MODULES } = require('../models/Role');
const { connectDB, disconnectDB } = require('../config/db');
const { generateAccessToken } = require('../utils/jwt');

let mongoServer;
let owner;
let token;
let company;
let notification;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());
  owner = await User.create({ name: 'Notification Owner', email: 'notification-owner@kevalon.com', passwordHash: 'hashed', role: 'user', isEmailVerified: true });
  token = generateAccessToken({ userId: owner._id.toString(), email: owner.email, role: owner.role });
  company = await Company.create({ name: 'Notification Co', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', createdBy: owner._id });
  notification = await Notification.create({
    userId: owner._id, companyId: company._id, type: 'GST', title: 'GST due soon',
    message: 'Your GST return is due in seven days.', channel: 'BELL', meta: { returnType: 'GSTR-3B' }
  });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const authed = (method, path, accessToken = token) => request(app)[method](path).set('Authorization', `Bearer ${accessToken}`);

describe('Module 20: Notification, Reminder & Alert Engine', () => {
  it('lists a user notification collection with the full contract shape', async () => {
    const res = await authed('get', `/api/notifications?userId=${owner._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(owner._id.toString());
    expect(res.body.data.items[0]).toMatchObject({
      id: notification._id.toString(), type: 'GST', title: 'GST due soon', read: false,
      channel: 'BELL', meta: { returnType: 'GSTR-3B' }
    });
    expect(res.body.data.items[0].readAt).toBeNull();
  });

  it('marks an owned notification as read and stamps readAt', async () => {
    const res = await authed('put', `/api/notifications/${notification._id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: notification._id.toString(), read: true });
    expect(res.body.data.readAt).not.toBeNull();
  });

  it('creates a valid reminder configuration and rejects invalid payloads', async () => {
    const created = await authed('post', '/api/reminders/config').send({
      companyId: company._id.toString(), type: 'GST_DUE', daysBefore: 7,
      enabled: true, channels: ['BELL', 'EMAIL'], config: { period: 'monthly' }
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      companyId: company._id.toString(), type: 'GST_DUE', daysBefore: 7,
      enabled: true, channels: ['BELL', 'EMAIL'], config: { period: 'monthly' }
    });
    expect(created.body.data.createdAt).toBeTruthy();
    expect(created.body.data.updatedAt).toBeTruthy();

    const invalid = await authed('post', '/api/reminders/config').send({
      companyId: company._id.toString(), type: 'GST_DUE', daysBefore: 0
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.success).toBe(false);
  });

  it('returns reminder configs in the placeholder shape when no scheduler exists', async () => {
    const res = await authed('get', `/api/reminders?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.companyId).toBe(company._id.toString());
    expect(res.body.data.items[0]).toMatchObject({ type: 'GST_DUE', nextRunAt: null });
  });

  it('returns a valid active-alert items array and allows filters', async () => {
    const res = await authed('get', `/api/alerts?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ companyId: company._id.toString(), items: [] });
  });

  it('acknowledges an alert and returns 404 for an unknown alert', async () => {
    const alert = await Alert.create({
      companyId: company._id, type: 'NEGATIVE_CASH', title: 'Negative cash balance',
      message: 'Cash balance is negative', severity: 'CRITICAL'
    });
    const res = await authed('put', `/api/alerts/${alert._id}/acknowledge`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: alert._id.toString(), acknowledged: true, acknowledgedBy: owner._id.toString() });
    expect(res.body.data.acknowledgedAt).not.toBeNull();

    const missing = await authed('put', `/api/alerts/${new mongoose.Types.ObjectId()}/acknowledge`);
    expect(missing.status).toBe(404);
  });

  it('denies notification configuration to a role without NotificationConfig permission', async () => {
    const employee = await User.create({
      name: 'Restricted Employee', email: 'restricted-notification@kevalon.com', passwordHash: 'hashed',
      companyAccess: [{ companyId: company._id, role: 'Employee', isActive: true }]
    });
    await Role.create({
      companyId: company._id,
      name: 'Employee',
      permissions: PERMISSION_MODULES.map((module) => ({ module, level: 'none' }))
    });
    const employeeToken = generateAccessToken({ userId: employee._id.toString(), email: employee.email, role: employee.role });
    const res = await authed('get', `/api/reminders?companyId=${company._id}`, employeeToken);
    expect(res.status).toBe(403);
  });
});
