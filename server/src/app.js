const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pino = require('pino');
const env = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const companyRoutes = require('./routes/company.routes');
const branchRoutes = require('./routes/branch.routes');
const financialYearRoutes = require('./routes/financialYear.routes');
const coaRoutes = require('./routes/coa.routes');
const bankAccountRoutes = require('./routes/bankAccount.routes');
const customerRoutes = require('./routes/customer.routes');
const errorHandler = require('./middleware/errorHandler');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration supporting comma-separated allowed origins
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser
app.use(express.json());

// Simple request logger middleware using structured pino
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, `Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Auth Routes mount
app.use('/api/auth', authRoutes);

// Company, Branch, and Financial Year Routes
app.use('/api/company', companyRoutes);
app.use('/api/branch', branchRoutes);
app.use('/api/financial-year', financialYearRoutes);
app.use('/api/coa', coaRoutes);
app.use('/api/bank-account', bankAccountRoutes);
app.use('/api/customer', customerRoutes);

// Catch-all route for unknown resources
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
