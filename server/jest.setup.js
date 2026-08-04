/**
 * Jest global setup - runs before all tests
 * Sets required environment variables for the test environment
 * so the Zod env validator in env.js does not fail.
 */

// Set required environment variables for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/kevalon-test'; // will be overridden by mongodb-memory-server
process.env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_12345678';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_12345678';
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_FROM = 'Test <test@kevalon.com>';
process.env.ALLOWED_ORIGINS = 'http://localhost:3001';
process.env.CLIENT_URL = 'http://localhost:3001';
