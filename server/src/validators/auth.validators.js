const { z } = require('zod');

// E.164 phone format regex
const phoneRegex = /^\+[1-9]\d{1,14}$/;

// Password policy: min 8 chars, at least 1 letter and 1 number
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;

const registerSchema = z.object({
  name: z.string({ required_error: 'name is required' }).min(1, 'name cannot be empty'),
  email: z.string({ required_error: 'email is required' }).email('invalid email address'),
  password: z.string({ required_error: 'password is required' })
    .min(8, 'password must be at least 8 characters')
    .regex(passwordRegex, 'password must contain at least one letter and one number'),
  phone: z.string().regex(phoneRegex, 'phone must be in E.164 format (e.g., +1234567890)').optional()
}).strict();

const loginSchema = z.object({
  email: z.string({ required_error: 'email is required' }).email('invalid email address'),
  password: z.string({ required_error: 'password is required' }).min(1, 'password cannot be empty')
}).strict();

const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'refreshToken is required' }).min(1, 'refreshToken cannot be empty')
}).strict();

const logoutSchema = z.object({
  refreshToken: z.string({ required_error: 'refreshToken is required' }).min(1, 'refreshToken cannot be empty')
}).strict();

const forgotPasswordSchema = z.object({
  email: z.string({ required_error: 'email is required' }).email('invalid email address')
}).strict();

const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'token is required' }).min(1, 'token cannot be empty'),
  newPassword: z.string({ required_error: 'newPassword is required' })
    .min(8, 'newPassword must be at least 8 characters')
    .regex(passwordRegex, 'newPassword must contain at least one letter and one number')
}).strict();

const sendOtpSchema = z.object({
  email: z.string({ required_error: 'email is required' }).email('invalid email address'),
  purpose: z.enum(['login', '2fa_setup'], { required_error: 'purpose is required' })
}).strict();

const verifyOtpSchema = z.object({
  email: z.string({ required_error: 'email is required' }).email('invalid email address'),
  otp: z.string({ required_error: 'otp is required' }).regex(/^\d{6}$/, 'otp must be a 6-digit number'),
  purpose: z.enum(['login', '2fa_setup'], { required_error: 'purpose is required' })
}).strict();

const verifyEmailSchema = z.object({
  token: z.string({ required_error: 'token is required' }).min(1, 'token cannot be empty')
}).strict();

const resendVerificationEmailSchema = z.object({
  email: z.string({ required_error: 'email is required' }).email('invalid email address')
}).strict();

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  verifyEmailSchema,
  resendVerificationEmailSchema
};
