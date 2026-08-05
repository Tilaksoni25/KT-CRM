const { z } = require('zod');

const validateGstinSchema = z.object({
  gstin: z
    .string({ required_error: 'gstin is required' })
    .trim()
    .min(1, 'gstin cannot be empty')
}).strict();

module.exports = {
  validateGstinSchema
};
