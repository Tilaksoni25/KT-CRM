const express = require('express');
const {
  createBankAccount,
  listBankAccounts,
  getBankAccountDetails,
  updateBankAccount,
  getAccountLedger,
  reconcileAccount
} = require('../controllers/bankAccount.controller');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const {
  createBankAccountSchema,
  updateBankAccountSchema,
  reconcileSchema
} = require('../validators/bankAccount.validators');

const router = express.Router();

// Apply JWT authentication to all routes
router.use(authenticate);

// 1. Add a new bank/cash/wallet/card account
router.post(
  '/',
  validateRequest(createBankAccountSchema),
  checkCompanyAccess,
  createBankAccount
);

// 2. List all accounts for a company
router.get(
  '/',
  checkCompanyAccess,
  listBankAccounts
);

// 3. Single account + current balance
router.get(
  '/:id',
  checkCompanyAccess,
  getBankAccountDetails
);

// 4. Update account details
router.put(
  '/:id',
  checkCompanyAccess,
  validateRequest(updateBankAccountSchema),
  updateBankAccount
);

// 5. Account's ledger/transaction history
router.get(
  '/:id/ledger',
  checkCompanyAccess,
  getAccountLedger
);

// 6. Reconcile against statement lines
router.post(
  '/:id/reconcile',
  checkCompanyAccess,
  validateRequest(reconcileSchema),
  reconcileAccount
);

module.exports = router;
