const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid MongoDB ObjectId');

const createReminderConfigSchema = z.object({
  companyId: objectId,
  type: z.string().trim().min(1, 'type is required').max(100),
  daysBefore: z.coerce.number().int().min(0, 'daysBefore must be zero or greater'),
  enabled: z.boolean().optional().default(true),
  channels: z.array(z.string().trim().min(1).max(50)).optional().default([])
});

const notificationQuerySchema = z.object({ userId: objectId });
const companyQuerySchema = z.object({ companyId: objectId });

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

module.exports = { createReminderConfigSchema, notificationQuerySchema, companyQuerySchema, validateQuery };
