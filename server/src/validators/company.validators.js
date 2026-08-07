const { z } = require('zod');

// GSTIN Regex
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
// PAN Regex
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
// Pincode Regex
const pincodeRegex = /^[1-9][0-9]{5}$/;

const createCompanySchema = z.object({
  name: z.string({ required_error: 'Company name is required' }).min(1, 'Company name cannot be empty'),
  gstin: z.string({ required_error: 'GSTIN is required' }).toUpperCase().regex(gstinRegex, 'Invalid Indian GSTIN format'),
  pan: z.string({ required_error: 'PAN is required' }).toUpperCase().regex(panRegex, 'Invalid Indian PAN format'),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().regex(pincodeRegex, 'Invalid Indian pincode').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  logoUrl: z.string().url('Invalid logo URL').optional().or(z.literal(''))
}).strict();

const updateCompanySchema = z.object({
  name: z.string().min(1, 'Company name cannot be empty').optional(),
  gstin: z.string().toUpperCase().regex(gstinRegex, 'Invalid Indian GSTIN format').optional(),
  pan: z.string().toUpperCase().regex(panRegex, 'Invalid Indian PAN format').optional(),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().regex(pincodeRegex, 'Invalid Indian pincode').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  logoUrl: z.string().url('Invalid logo URL').optional().or(z.literal(''))
}).strict();

const createBranchSchema = z.object({
  companyId: z.string().min(1, 'Company ID cannot be empty').optional(),
  branchName: z.string({ required_error: 'Branch name is required' }).min(1, 'Branch name cannot be empty'),
  branchCode: z.string().trim().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().regex(pincodeRegex, 'Invalid Indian pincode').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  manager: z.string().optional().or(z.literal('')),
  isHeadOffice: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
}).strict();

const updateBranchSchema = z.object({
  branchName: z.string().min(1, 'Branch name cannot be empty').optional(),
  branchCode: z.string().trim().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().regex(pincodeRegex, 'Invalid Indian pincode').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  manager: z.string().optional().or(z.literal('')),
  isHeadOffice: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
}).strict();

const createFYSchema = z.object({
  companyId: z.string({ required_error: 'Company ID is required' }).min(1, 'Company ID cannot be empty'),
  startDate: z.string({ required_error: 'Start date is required' }).datetime({ message: 'Invalid start date datetime string' }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date format (YYYY-MM-DD)')),
  endDate: z.string({ required_error: 'End date is required' }).datetime({ message: 'Invalid end date datetime string' }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date format (YYYY-MM-DD)')),
  yearLabel: z.string({ required_error: 'Year label is required' }).min(1, 'Year label cannot be empty')
}).strict();

module.exports = {
  createCompanySchema,
  updateCompanySchema,
  createBranchSchema,
  updateBranchSchema,
  createFYSchema
};
