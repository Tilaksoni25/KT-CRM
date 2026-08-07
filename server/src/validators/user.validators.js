const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const inviteUserSchema = z.object({
  companyId: z
    .string({ required_error: 'companyId is required' })
    .regex(objectIdRegex, 'Invalid companyId format'),
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, 'name cannot be empty'),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email format'),
  phone: z.string().trim().optional().or(z.literal('')),
  role: z
    .string({ required_error: 'role is required' })
    .trim()
    .min(1, 'role cannot be empty'),
  sendTemporaryPassword: z.boolean().optional().default(false)
}).strict();

const updateUserSchema = z.object({
  companyId: z
    .string({ required_error: 'companyId is required' })
    .regex(objectIdRegex, 'Invalid companyId format'),
  role: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().or(z.literal(''))
}).strict();

module.exports = {
  inviteUserSchema,
  updateUserSchema
};
