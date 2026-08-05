const express = require('express');
const {
  createCustomer,
  listCustomers,
  getCustomerDetails,
  updateCustomer,
  deactivateCustomer,
  getCustomerLedger,
  getCustomerInvoices
} = require('../controllers/customer.controller');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const {
  createCustomerSchema,
  updateCustomerSchema
} = require('../validators/customer.validators');

const router = express.Router();

// Apply JWT authentication to all routes
router.use(authenticate);

// 1. Create a new customer
router.post(
  '/',
  validateRequest(createCustomerSchema),
  checkCompanyAccess,
  createCustomer
);

// 2. List/search customers
router.get(
  '/',
  checkCompanyAccess,
  listCustomers
);

// 3. Single customer detail
router.get(
  '/:id',
  checkCompanyAccess,
  getCustomerDetails
);

// 4. Update customer
router.put(
  '/:id',
  checkCompanyAccess,
  validateRequest(updateCustomerSchema),
  updateCustomer
);

// 5. Deactivate/delete customer (soft-deactivate)
router.delete(
  '/:id',
  checkCompanyAccess,
  deactivateCustomer
);

// 6. Customer's ledger history
router.get(
  '/:id/ledger',
  checkCompanyAccess,
  getCustomerLedger
);

// 7. Customer's invoices list
router.get(
  '/:id/invoices',
  checkCompanyAccess,
  getCustomerInvoices
);

module.exports = router;
