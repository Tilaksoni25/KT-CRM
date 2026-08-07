const express = require('express');
const { createFinancialYear, listFinancialYears, lockFinancialYear } = require('../controllers/financialYear.controller');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { createFYSchema } = require('../validators/company.validators');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @openapi
 * /api/financial-year:
 *   post:
 *     summary: Create a new financial year
 *     description: Creates a financial year profile for a company. Ensures there are no date overlaps with existing ranges.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *               - startDate
 *               - endDate
 *               - yearLabel
 *             properties:
 *               companyId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               yearLabel:
 *                 type: string
 *                 example: "2025-26"
 *               isLocked:
 *                 type: boolean
 *                 description: Optional lock state when creating a financial year
 *     responses:
 *       201:
 *         description: Financial year created successfully
 *       400:
 *         description: Invalid parameters (e.g. startDate is after endDate)
 *       403:
 *         description: Access denied (Data isolation violation)
 *       409:
 *         description: Financial year overlaps with an existing range
 */
router.post('/', validateRequest(createFYSchema), checkCompanyAccess, createFinancialYear);

/**
 * @openapi
 * /api/financial-year:
 *   get:
 *     summary: List all financial years for a company
 *     description: Retrieves all financial years belonging to the specified company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       403:
 *         description: Access denied (Data isolation violation)
 */
router.get('/', checkCompanyAccess, listFinancialYears);

/**
 * @openapi
 * /api/financial-year/{id}/lock:
 *   put:
 *     summary: Lock a financial year
 *     description: Locks a financial year to prevent transaction entry postings.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Financial year locked successfully
 *       400:
 *         description: Already locked
 *       403:
 *         description: Access denied (Data isolation violation)
 *       404:
 *         description: Financial year not found
 */
router.put('/:id/lock', checkCompanyAccess, lockFinancialYear);

module.exports = router;
