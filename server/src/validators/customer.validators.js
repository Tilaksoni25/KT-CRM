const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const addressSchema = z.object({
  line1: z.string({ required_error: 'Address line 1 is required' })
    .trim()
    .min(1, 'Address line 1 cannot be empty'),
  line2: z.string().trim().optional().or(z.literal('')),
  city: z.string({ required_error: 'City is required' })
    .trim()
    .min(1, 'City cannot be empty'),
  state: z.string({ required_error: 'State is required' })
    .trim()
    .min(1, 'State cannot be empty'),
  pincode: z.string({ required_error: 'Pincode is required' })
    .trim()
    .min(1, 'Pincode cannot be empty'),
  country: z.string().trim().default('India')
}).strict();

const createCustomerSchema = z.object({
  companyId: z.string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format'),
  name: z.string({ required_error: 'Customer name is required' })
    .trim()
    .min(1, 'Customer name cannot be empty'),
  gstin: z.string().trim().toUpperCase().optional().nullable().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('Invalid email format').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  billingAddress: addressSchema,
  shippingAddress: addressSchema.optional(),
  creditLimit: z.number().default(0),
  creditPeriodDays: z.number().default(0),
  openingBalance: z.number().default(0),
  openingBalanceType: z.enum(['Dr', 'Cr']).default('Dr')
}).strict();

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name cannot be empty').optional(),
  gstin: z.string().trim().toUpperCase().optional().nullable().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('Invalid email format').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  creditLimit: z.number().optional(),
  creditPeriodDays: z.number().optional(),
  isActive: z.boolean().optional(),
  
  // Reject coaAccountId changes (handled explicitly in controller)
  coaAccountId: z.any().optional()
}).strict();

module.exports = {
  createCustomerSchema,
  updateCustomerSchema
};
