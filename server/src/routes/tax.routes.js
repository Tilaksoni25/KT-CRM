const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const taxController = require('../controllers/tax.controller');

// Seed default tax rates for a company (idempotent)
router.post(
  '/seed-default',
  authenticate,
  checkCompanyAccess,
  taxController.seedDefaultTax
);

// Create a custom tax rate
router.post(
  '/',
  authenticate,
  checkCompanyAccess,
  taxController.createTax
);

// List tax rates for a company
router.get(
  '/',
  authenticate,
  checkCompanyAccess,
  taxController.listTaxRates
);

module.exports = router;
