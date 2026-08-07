const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string({
    required_error: 'MONGO_URI is required'
  }),
  JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET should be at least 8 characters'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET should be at least 8 characters'),
  SMTP_HOST: z.string().optional().or(z.literal('')),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().or(z.literal('')),
  SMTP_PASS: z.string().optional().or(z.literal('')),
  SMTP_FROM: z.string().default('Kevalon ERP <tilak.kevalon@gmail.com>'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  CLIENT_URL: z.string().url().default('http://localhost:3000')
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Environment configuration validation failed:', result.error.format());
  process.exit(1);
}

module.exports = result.data;
