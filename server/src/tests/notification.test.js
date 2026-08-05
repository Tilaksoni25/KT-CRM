const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const Company = require('../models/Company');
const Notification = require('../models/Notification');
const Alert = require('../models/Alert');
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
    userId: owner._id,
    companyId: company._id,
    type: 'GST',
    title: 'GST due soon',
    message: 'Your GST return is due in seven days.'
  });
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});

const authed = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

describe('Module 20: Notification, Reminder & Alert Engine integration tests', () => {
  it('lists a user notification collection with the expected shape', async () => {
    const res = await authed('get', `/api/notifications?userId=${owner._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(owner._id.toString());
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe('GST due soon');
  });

  it('marks a notification as read', async () => {
    const res = await authed('put', `/api/notifications/${notification._id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: notification._id.toString(), read: true });
    const stored = await Notification.findById(notification._id);
    expect(stored.readAt).not.toBeNull();
  });

  it('creates a reminder configuration', async () => {
    const res = await authed('post', '/api/reminders/config').send({
      companyId: company._id.toString(), type: 'GST', daysBefore: 7, enabled: true, channels: ['in-app', 'email']
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ companyId: company._id.toString(), type: 'GST', daysBefore: 7, enabled: true, channels: ['in-app', 'email'] });
  });

  it('returns a placeholder-safe empty reminder list without a scheduler', async () => {
    const res = await authed('get', `/api/reminders?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ companyId: company._id.toString(), items: [] });
  });

  it('returns a placeholder-safe empty active-alert list without an alert generator', async () => {
    const res = await authed('get', `/api/alerts?companyId=${company._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ companyId: company._id.toString(), items: [] });
  });

  it('acknowledges an alert and persists acknowledgement metadata', async () => {
    const alert = await Alert.create({ companyId: company._id, type: 'NEGATIVE_CASH', message: 'Cash balance is negative', severity: 'critical' });
    const res = await authed('put', `/api/alerts/${alert._id}/acknowledge`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: alert._id.toString(), acknowledged: true });
    const stored = await Alert.findById(alert._id);
    expect(stored.acknowledgedAt).not.toBeNull();
    expect(stored.acknowledgedBy.toString()).toBe(owner._id.toString());
  });
});
