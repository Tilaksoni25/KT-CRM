const env = require('../config/env');
const pino = require('pino');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

/**
 * Centeralized Express error handling middleware
 * @param {Error} err 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error with request details, omitting confidential info
  logger.error({
    err: {
      message: err.message,
      stack: env.NODE_ENV !== 'production' ? err.stack : undefined
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    }
  }, `Express Error: ${message}`);

  const response = {
    success: false,
    message
  };

  // Only append stack trace in development or testing modes
  if (env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    response.details = err.details || undefined;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
