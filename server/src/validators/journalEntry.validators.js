const { z } = require('zod');

const journalLineSchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
  debit: z.coerce.number().nonnegative('debit cannot be negative').default(0),
  credit: z.coerce.number().nonnegative('credit cannot be negative').default(0),
  remarks: z.string().trim().max(1000).optional()
}).superRefine((line, ctx) => {
  if (line.debit === 0 && line.credit === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A line cannot have both debit and credit as zero', path: ['debit'] });
  }
  if (line.debit > 0 && line.credit > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A line cannot have both debit and credit amounts', path: ['debit'] });
  }
});

const createJournalEntrySchema = z.object({
  companyId: z.string().min(1, 'companyId is required'),
  financialYearId: z.string().min(1, 'financialYearId is required'),
  entryDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'entryDate must be a valid date'),
  reference: z.string().trim().max(255).optional(),
  narration: z.string().trim().max(5000).optional(),
  lines: z.array(journalLineSchema).min(2, 'At least two journal lines are required')
});

module.exports = { createJournalEntrySchema };
