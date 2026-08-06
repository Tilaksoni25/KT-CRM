const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid MongoDB ObjectId');
const amount = z.coerce.number().finite().min(0);
const isoDate = z.string().datetime({ offset: true }).or(z.string().date());
const statuses = ['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

const lineItemSchema = z.object({
  productId: objectId.nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().finite().positive(),
  rate: amount,
  discount: amount.optional().default(0),
  taxableAmount: amount,
  taxRateId: objectId.nullable().optional(),
  taxAmount: amount.optional().default(0),
  totalAmount: amount
}).strict();

const invoiceFields = {
  invoiceDate: isoDate,
  dueDate: isoDate.nullable().optional(),
  reference: z.string().trim().max(200).optional().default(''),
  lineItems: z.array(lineItemSchema).min(1),
  subTotal: amount,
  discountTotal: amount.optional().default(0),
  taxTotal: amount,
  grandTotal: amount,
  roundOff: z.coerce.number().finite().optional().default(0),
  notes: z.string().trim().max(5000).optional().default(''),
  meta: z.record(z.unknown()).optional().default({})
};

const createInvoiceSchema = z.object({
  companyId: objectId,
  financialYearId: objectId,
  customerId: objectId,
  ...invoiceFields
}).strict();

const updateInvoiceSchema = z.object(invoiceFields).strict();

const invoiceQuerySchema = z.object({
  companyId: objectId,
  customerId: objectId.optional(),
  status: z.string().trim().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
}).strict();

const validateQuery = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Validation failed', errorCode: 'INVALID_QUERY', errors: parsed.error.errors });
  req.query = parsed.data;
  next();
};

module.exports = { createInvoiceSchema, updateInvoiceSchema, invoiceQuerySchema, validateQuery, statuses };
