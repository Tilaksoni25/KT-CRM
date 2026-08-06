const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const requireOnboarding = require('../middleware/requireOnboarding');
const requirePermission = require('../middleware/requirePermission');
const caPanelController = require('../controllers/caPanel.controller');

// All endpoints in CA Panel require view permission on Reports
router.get(
  '/dashboard',
  authenticate,
  checkCompanyAccess,
  requireOnboarding,
  requirePermission('Reports', 'view'),
  caPanelController.getDashboard
);

router.get(
  '/audit-report',
  authenticate,
  checkCompanyAccess,
  requirePermission('Reports', 'view'),
  caPanelController.getAuditReport
);

router.get(
  '/income-tax-summary',
  authenticate,
  checkCompanyAccess,
  requirePermission('Reports', 'view'),
  caPanelController.getIncomeTaxSummary
);

module.exports = router;
