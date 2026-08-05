const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const gstController = require('../controllers/gst.controller');

// Validate a GSTIN format and checksum (stateless, auth required)
router.post(
  '/validate-gstin',
  authenticate,
  gstController.validateGstin
);

// Get returns summary (company isolation, auth required)
router.get(
  '/returns-summary',
  authenticate,
  checkCompanyAccess,
  gstController.getGstReturnsSummary
);

module.exports = router;
