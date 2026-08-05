const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid MongoDB ObjectId');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD format');

const ledgerQuerySchema = z.object({
  companyId: objectId,
  financialYearId: objectId.optional(),
  from: date.optional(),
  to: date.optional()
}).superRefine((query, ctx) => {
  if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'from must not be after to' });
  }
});

const validateLedgerQuery = (req, res, next) => {
  const parsed = ledgerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errorCode: 'INVALID_LEDGER_QUERY',
      errors: parsed.error.errors.map((error) => ({ field: error.path.join('.'), message: error.message }))
    });
  }
  req.query = parsed.data;
  next();
};

module.exports = { validateLedgerQuery };
