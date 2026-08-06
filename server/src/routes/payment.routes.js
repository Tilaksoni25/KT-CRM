const express = require('express');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { receivePaymentSchema, paymentQuerySchema, validateQuery } = require('../validators/payment.validators');
const controller = require('../controllers/payment.controller');

const router = express.Router();
router.post('/receive', authenticate, validateRequest(receivePaymentSchema), checkCompanyAccess, controller.receive);
router.get('/', authenticate, validateQuery(paymentQuerySchema), checkCompanyAccess, controller.list);
router.get('/:id', authenticate, checkCompanyAccess, controller.get);
module.exports = router;
