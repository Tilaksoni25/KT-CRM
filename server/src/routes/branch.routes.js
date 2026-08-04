const express = require('express');
const { createBranch, listBranches, updateBranch, deleteBranch } = require('../controllers/branch.controller');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { createBranchSchema, updateBranchSchema } = require('../validators/company.validators');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @openapi
 * /api/branch:
 *   post:
 *     summary: Add a new branch
 *     description: Adds a new branch under a company. If it is the first branch, it is automatically marked as Head Office.
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
 *               - branchName
 *             properties:
 *               companyId:
 *                 type: string
 *               branchName:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               pincode:
 *                 type: string
 *               isHeadOffice:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       201:
 *         description: Branch added successfully
 *       403:
 *         description: Access denied (Data isolation violation)
 */
router.post('/', validateRequest(createBranchSchema), checkCompanyAccess, createBranch);

/**
 * @openapi
 * /api/branch:
 *   get:
 *     summary: List all branches of a company
 *     description: Retrieves all branches belonging to the specified company.
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
router.get('/', checkCompanyAccess, listBranches);

/**
 * @openapi
 * /api/branch/{id}:
 *   put:
 *     summary: Update branch details
 *     description: Modifies branch fields. If set as Head Office, unsets any other Head Office for the company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Branch updated successfully
 *       400:
 *         description: Invalid state (e.g. attempting to unset the only Head Office)
 *       403:
 *         description: Access denied (Data isolation violation)
 *       404:
 *         description: Branch not found
 */
router.put('/:id', checkCompanyAccess, validateRequest(updateBranchSchema), updateBranch);

/**
 * @openapi
 * /api/branch/{id}:
 *   delete:
 *     summary: Remove a branch
 *     description: Deletes a branch if it is not a Head Office and has no transactions associated with it.
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
 *         description: Branch deleted successfully
 *       400:
 *         description: Cannot delete due to business constraints (Head Office status or active transactions)
 *       403:
 *         description: Access denied (Data isolation violation)
 *       404:
 *         description: Branch not found
 */
router.delete('/:id', checkCompanyAccess, deleteBranch);

module.exports = router;
