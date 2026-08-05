const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createTaxSchema = z.object({
  companyId: z
    .string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format'),
  name: z
    .string({ required_error: 'Tax rate name is required' })
    .trim()
    .min(1, 'Tax rate name cannot be empty'),
  ratePercent: z
    .number({ required_error: 'Rate percentage is required' })
    .min(0, 'Rate percent cannot be negative')
    .max(100, 'Rate percent cannot exceed 100'),
  taxCategory: z
    .enum(['Taxable', 'Exempt', 'NilRated', 'ZeroRated'])
    .default('Taxable'),
  hsnSacApplicable: z
    .boolean()
    .optional()
    .default(true)
}).strict();

const seedDefaultTaxSchema = z.object({
  companyId: z
    .string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format')
}).strict();

module.exports = {
  createTaxSchema,
  seedDefaultTaxSchema
};
