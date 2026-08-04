const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');
const { connectDB, disconnectDB } = require('../config/db');
const { hashSha256 } = require('../utils/hash');

let mongoServer;

beforeAll(async () => {
  // Create MongoMemoryServer instance
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  // Connect Mongoose to the memory server uri
  await connectDB(uri);
});

afterAll(async () => {
  // Disconnect and shutdown
  await disconnectDB();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all DB collections before each test run
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Authentication Endpoints Integration Tests', () => {
  const testUser = {
    name: 'Test Admin',
    email: 'admin@kevalon.com',
    password: 'SecurePassword123',
    phone: '+12025550143'
  };

  describe('POST /api/auth/register', () => {
    it('should successfully register a new user with valid parameters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toContain('Registered successfully');
      expect(res.body.data).toHaveProperty('userId');
      expect(res.body.data.email).toBe(testUser.email.toLowerCase());
      
      // Ensure password hash, tokens are not returned
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('accessToken');
      
      // Verify database has password hash
      const userInDb = await User.findOne({ email: testUser.email }).select('+passwordHash');
      expect(userInDb).toBeDefined();
      expect(userInDb.passwordHash).not.toBe(testUser.password);
    });

    it('should reject registration if email is duplicate', async () => {
      // First registration
      await request(app).post('/api/auth/register').send(testUser);

      // Duplicate registration
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already registered');
    });

    it('should reject registration on validation failures', async () => {
      const invalidUser = {
        name: '',
        email: 'invalid-email',
        password: 'short'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body).toHaveProperty('errors');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create user before testing login
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    });

    it('should fail login and increment attempts with incorrect credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);

      const user = await User.findOne({ email: testUser.email });
      expect(user.loginAttempts).toBe(1);
    });

    it('should lock user account after 5 consecutive failed attempts', async () => {
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'WrongPassword'
          });
      }

      // Check database status
      const user = await User.findOne({ email: testUser.email });
      expect(user.loginAttempts).toBe(5);
      expect(user.lockUntil).toBeDefined();

      // 6th attempt should return 423 Locked
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password // correct password should still fail when locked
        });

      expect(res.statusCode).toBe(423);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('locked');
    });
  });

  describe('POST /api/auth/refresh-token Rotation and Reuse', () => {
    let accessToken;
    let refreshToken;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      
      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should successfully rotate tokens with a valid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should detect token reuse, revoke all sessions, and fail login requests', async () => {
      // First rotation - works
      const rotateRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      const newRefreshToken = rotateRes.body.data.refreshToken;

      // Second rotation with the OLD token (reuse violation!)
      const reuseRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(reuseRes.statusCode).toBe(401);
      expect(reuseRes.body.message).toContain('reuse detected');

      // Check that the new refresh token is now also invalidated (all sessions revoked)
      const user = await User.findOne({ email: testUser.email }).select('+refreshTokens');
      expect(user.refreshTokens.length).toBe(0);

      const rotateResAttempt2 = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: newRefreshToken });

      expect(rotateResAttempt2.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/reset-password Workflow', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('should request forgot-password and reset password successfully', async () => {
      // 1. Request forgot password
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testUser.email });

      expect(forgotRes.statusCode).toBe(200);
      expect(forgotRes.body.success).toBe(true);

      // Retrieve reset token directly from database for testing
      const user = await User.findOne({ email: testUser.email }).select('+passwordResetTokenHash +passwordResetExpires');
      expect(user.passwordResetTokenHash).toBeDefined();
      expect(user.passwordResetExpires).toBeDefined();

      // Since we hashed it, we mock the plain token generation process.
      // But we can check that if we do the reset it works.
      // Wait, we need the plain reset token value. To test this in integration, let's write a mock token or edit the user to have a known reset token hash.
      const testPlainToken = 'myMockPlainResetPasswordTokenString123';
      user.passwordResetTokenHash = hashSha256(testPlainToken);
      user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      // 2. Perform password reset
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: testPlainToken,
          newPassword: 'NewSecurePassword99'
        });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // 3. Test logging in with the old password (should fail)
      const oldLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      expect(oldLoginRes.statusCode).toBe(401);

      // 4. Test logging in with the new password (should succeed)
      const newLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'NewSecurePassword99'
        });
      expect(newLoginRes.statusCode).toBe(200);
      expect(newLoginRes.body.data).toHaveProperty('accessToken');
    });
  });

  // ─── Addendum: Email Verification ─────────────────────────────────────────

  describe('POST /api/auth/register (triggers verification email)', () => {
    it('should store a hashed verification token after registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toContain('verify your account');

      // Verify token fields are present in the DB but NOT in the response
      const user = await User.findOne({ email: testUser.email })
        .select('+emailVerificationTokenHash +emailVerificationExpires');
      expect(user.emailVerificationTokenHash).toBeDefined();
      expect(user.emailVerificationExpires).toBeDefined();
      expect(user.isEmailVerified).toBe(false);

      // Confirm secrets are not leaked in the response
      expect(res.body.data).not.toHaveProperty('emailVerificationTokenHash');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('should verify email successfully with a valid token', async () => {
      // Fetch the hashed token from DB, inject a known plain token
      const plainToken = 'test_email_verification_token_abc123xyz';
      const user = await User.findOne({ email: testUser.email })
        .select('+emailVerificationTokenHash +emailVerificationExpires');

      user.emailVerificationTokenHash = hashSha256(plainToken);
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: plainToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('verified');

      // Confirm isEmailVerified is now true and token cleared
      const updated = await User.findOne({ email: testUser.email })
        .select('+emailVerificationTokenHash +emailVerificationExpires');
      expect(updated.isEmailVerified).toBe(true);
      expect(updated.emailVerificationTokenHash).toBeUndefined();
    });

    it('should return 400 for an expired verification token', async () => {
      const plainToken = 'expired_verification_token_xyz';
      const user = await User.findOne({ email: testUser.email })
        .select('+emailVerificationTokenHash +emailVerificationExpires');

      user.emailVerificationTokenHash = hashSha256(plainToken);
      user.emailVerificationExpires = new Date(Date.now() - 1000); // already expired
      await user.save();

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: plainToken });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for an invalid (nonexistent) verification token', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'this_token_does_not_exist_at_all' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Addendum: Device Sessions ─────────────────────────────────────────────

  describe('GET /api/auth/sessions', () => {
    let accessToken;
    let refreshToken;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Test Suite)')
        .send({ email: testUser.email, password: testUser.password });
      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should list active sessions after login', async () => {
      const res = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const session = res.body.data[0];
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('ip');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('expiresAt');
      expect(session).toHaveProperty('isCurrent');
      expect(session).toHaveProperty('lastUsedAt');
      // userAgent is present as a key (may be null/string depending on client)
      expect(Object.prototype.hasOwnProperty.call(session, 'userAgent')).toBe(true);
      // Hash must never be returned
      expect(session).not.toHaveProperty('tokenHash');
    });
  });

  describe('DELETE /api/auth/sessions/:id', () => {
    let accessToken;
    let refreshToken;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should revoke a session and block subsequent refresh-token calls', async () => {
      // Get session list
      const sessionsRes = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(sessionsRes.body.data.length).toBeGreaterThanOrEqual(1);
      const sessionId = sessionsRes.body.data[0].sessionId;

      // Revoke the session
      const revokeRes = await request(app)
        .delete(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Attempt to rotate using the now-revoked refresh token — must fail with 401
      const rotateRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(rotateRes.statusCode).toBe(401);
    });

    it('should return 404 for a session ID that does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`/api/auth/sessions/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
