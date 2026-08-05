const express = require('express');
const {
  createAccount,
  listAccounts,
  getAccountDetails,
  updateAccount,
  deleteAccount,
  seedDefaultCoaRoute
} = require('../controllers/coa.controller');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { createCoaSchema, updateCoaSchema } = require('../validators/coa.validators');

const router = express.Router();

// Apply JWT authentication to all routes
router.use(authenticate);

/**
 * @openapi
 * /api/coa:
 *   post:
 *     summary: Create a custom account
 *     description: Adds a new group or ledger account under a company.
 *     security:
 *       - bearerAuth: []
 */
router.post('/', validateRequest(createCoaSchema), checkCompanyAccess, createAccount);

/**
 * @openapi
 * /api/coa:
 *   get:
 *     summary: List all accounts
 *     description: Returns flat list or nested tree of accounts.
 *     security:
 *       - bearerAuth: []
 */
router.get('/', checkCompanyAccess, listAccounts);

/**
 * @openapi
 * /api/coa/seed-default:
 *   post:
 *     summary: Seed default Chart of Accounts
 *     description: Seed the standard default accounts for a new company.
 *     security:
 *       - bearerAuth: []
 */
router.post('/seed-default', checkCompanyAccess, seedDefaultCoaRoute);

/**
 * @openapi
 * /api/coa/{id}:
 *   get:
 *     summary: Get single account details
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', checkCompanyAccess, getAccountDetails);

/**
 * @openapi
 * /api/coa/{id}:
 *   put:
 *     summary: Update an account
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', checkCompanyAccess, validateRequest(updateCoaSchema), updateAccount);

/**
 * @openapi
 * /api/coa/{id}:
 *   delete:
 *     summary: Delete an account (soft delete)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', checkCompanyAccess, deleteAccount);

module.exports = router;
