const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid MongoDB ObjectId');
const channels = ['BELL', 'EMAIL', 'SMS', 'WHATSAPP'];
const reminderTypes = ['GST_DUE', 'INVOICE_DUE', 'AMC_RENEWAL', 'GENERIC'];
const alertSeverities = ['INFO', 'WARNING', 'CRITICAL'];
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const isoDateQuery = z.string().datetime({ offset: true }).or(z.string().date());

const createReminderConfigSchema = z.object({
  companyId: objectId,
  type: z.enum(reminderTypes),
  daysBefore: z.coerce.number().int().positive('daysBefore must be greater than zero'),
  enabled: z.boolean().optional().default(true),
  channels: z.array(z.enum(channels)).min(1).optional().default(['BELL']),
  config: z.record(z.unknown()).optional().default({})
}).strict();

const notificationQuerySchema = z.object({
  userId: objectId,
  read: booleanQuery.optional(),
  type: z.string().trim().min(1).max(100).optional(),
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional()
}).strict();

const reminderQuerySchema = z.object({
  companyId: objectId,
  type: z.enum(reminderTypes).optional(),
  enabled: booleanQuery.optional(),
  from: isoDateQuery.optional(),
  to: isoDateQuery.optional()
}).strict();

const alertQuerySchema = z.object({
  companyId: objectId,
  type: z.string().trim().min(1).max(100).optional(),
  severity: z.enum(alertSeverities).optional(),
  acknowledged: booleanQuery.optional()
}).strict();

const validateQuery = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errorCode: 'INVALID_QUERY',
      errors: parsed.error.errors.map((error) => ({ field: error.path.join('.'), message: error.message }))
    });
  }
  req.query = parsed.data;
  next();
};

module.exports = {
  createReminderConfigSchema,
  notificationQuerySchema,
  reminderQuerySchema,
  alertQuerySchema,
  validateQuery
};
