const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createBankAccountSchema = z.object({
  companyId: z.string({ required_error: 'Company ID is required' })
    .regex(objectIdRegex, 'Invalid Company ID format'),
  accountType: z.enum(['Savings', 'Current', 'Cash', 'Wallet', 'CreditCard', 'UPI'], {
    required_error: 'Account type is required',
    invalid_type_error: 'Account type must be Savings, Current, Cash, Wallet, CreditCard, or UPI'
  }),
  accountName: z.string({ required_error: 'Account name is required' })
    .trim()
    .min(1, 'Account name cannot be empty'),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  ifscCode: z.string().trim().optional(),
  branchName: z.string().trim().optional(),
  openingBalance: z.number().default(0),
  openingBalanceDate: z.string().datetime().or(z.date()).optional().or(z.literal(''))
}).strict().superRefine((data, ctx) => {
  const { accountType, bankName, accountNumber, ifscCode } = data;

  if (accountType === 'Savings' || accountType === 'Current') {
    if (!bankName || bankName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankName'],
        message: 'Bank name is required for Savings/Current accounts'
      });
    }
    if (!accountNumber || accountNumber.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountNumber'],
        message: 'Account number is required for Savings/Current accounts'
      });
    }
    if (!ifscCode || ifscCode.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ifscCode'],
        message: 'IFSC code is required for Savings/Current accounts'
      });
    }
  }

  if (accountType === 'CreditCard') {
    if (!bankName || bankName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankName'],
        message: 'Bank name is required for Credit Card accounts'
      });
    }
    if (!accountNumber || accountNumber.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountNumber'],
        message: 'Account number is required for Credit Card accounts'
      });
    }
  }
});

const updateBankAccountSchema = z.object({
  accountName: z.string().trim().min(1, 'Account name cannot be empty').optional(),
  bankName: z.string().trim().optional(),
  ifscCode: z.string().trim().optional(),
  branchName: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  
  // These fields are forbidden to update in controller, but validated as optional here to allow controller logic to raise explicit 400
  accountType: z.any().optional(),
  accountNumber: z.any().optional(),
  coaAccountId: z.any().optional()
}).strict();

const reconcileSchema = z.object({
  statementDate: z.string({ required_error: 'Statement date is required' }).datetime().or(z.date()),
  statementLines: z.array(
    z.object({
      date: z.string({ required_error: 'Line date is required' }).datetime().or(z.date()),
      description: z.string({ required_error: 'Line description is required' }).trim().min(1, 'Description cannot be empty'),
      amount: z.number({ required_error: 'Line amount is required' }),
      type: z.enum(['credit', 'debit'], { required_error: 'Line type must be credit or debit' }),
      referenceNo: z.string().trim().optional()
    })
  ).min(1, 'At least one statement line is required to reconcile')
}).strict();

module.exports = {
  createBankAccountSchema,
  updateBankAccountSchema,
  reconcileSchema
};
