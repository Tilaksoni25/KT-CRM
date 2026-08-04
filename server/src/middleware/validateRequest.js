/**
 * Express middleware to validate request body using Zod schemas
 * @param {import('zod').ZodSchema} schema 
 * @returns {import('express').RequestHandler}
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors
      });
    }

    // Override body with validated, sanitized data
    req.body = result.data;
    next();
  };
};

module.exports = validateRequest;
