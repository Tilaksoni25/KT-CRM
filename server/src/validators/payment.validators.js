const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid MongoDB ObjectId');
const date = z.string().datetime({ offset: true }).or(z.string().date());
const amount = z.coerce.number().finite().positive();
const modes = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'];
const bankModes = new Set(['BANK_TRANSFER', 'CHEQUE', 'UPI']);

const allocationSchema = z.object({ invoiceId: objectId, allocatedAmount: amount }).strict();

const receivePaymentSchema = z.object({
  companyId: objectId,
  financialYearId: objectId,
  customerId: objectId,
  paymentDate: date,
  mode: z.enum(modes),
  bankAccountId: objectId.nullable().optional(),
  reference: z.string().trim().max(200).optional().default(''),
  totalAmount: amount,
  allocations: z.array(allocationSchema).min(1, 'At least one invoice allocation is required in strict mode'),
  notes: z.string().trim().max(5000).optional().default('')
}).strict().superRefine((data, ctx) => {
  if (bankModes.has(data.mode) && !data.bankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountId'], message: `bankAccountId is required for ${data.mode}` });
  }
  const allocationTotal = data.allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);
  if (Math.abs(allocationTotal - data.totalAmount) > 0.01) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'In strict mode, allocation total must equal totalAmount' });
  }
  if (new Set(data.allocations.map((allocation) => allocation.invoiceId)).size !== data.allocations.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'An invoice can only appear once in allocations' });
  }
});

const paymentQuerySchema = z.object({
  companyId: objectId,
  customerId: objectId.optional(),
  financialYearId: objectId.optional(),
  mode: z.enum(modes).optional(),
  status: z.enum(['POSTED', 'REVERSED']).optional(),
  from: date.optional(),
  to: date.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
}).strict();

const validateQuery = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Validation failed', errorCode: 'INVALID_QUERY', errors: parsed.error.errors });
  req.query = parsed.data;
  next();
};

module.exports = { receivePaymentSchema, paymentQuerySchema, validateQuery };
