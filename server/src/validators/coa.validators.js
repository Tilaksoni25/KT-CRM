const { z } = require('zod');

// Regex to validate MongoDB ObjectId format
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createCoaSchema = z.object({
  companyId: z.string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format'),
  name: z.string({ required_error: 'Account name is required' })
    .trim()
    .min(1, 'Account name cannot be empty'),
  type: z.enum(['Asset', 'Liability', 'Equity', 'Income', 'Expense'], {
    required_error: 'Account type is required',
    invalid_type_error: 'Account type must be Asset, Liability, Equity, Income, or Expense'
  }),
  isGroup: z.boolean().default(false),
  parentId: z.string()
    .regex(objectIdRegex, 'Invalid Parent ID format')
    .nullable()
    .optional()
    .or(z.literal(''))
    .or(z.literal(null)),
  code: z.string().trim().optional().or(z.literal('')),
  openingBalance: z.number().default(0),
  openingBalanceType: z.enum(['Dr', 'Cr']).default('Dr')
}).strict();

const updateCoaSchema = z.object({
  name: z.string().trim().min(1, 'Account name cannot be empty').optional(),
  parentId: z.string()
    .regex(objectIdRegex, 'Invalid Parent ID format')
    .nullable()
    .optional()
    .or(z.literal(''))
    .or(z.literal(null)),
  code: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  type: z.any().optional(),
  isGroup: z.any().optional()
}).strict();

module.exports = {
  createCoaSchema,
  updateCoaSchema
};
