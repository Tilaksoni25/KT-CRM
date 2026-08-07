const express = require('express');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { createInvoiceSchema, invoiceQuerySchema, validateQuery, updateInvoiceSchema } = require('../validators/invoice.validators');
const controller = require('../controllers/invoice.controller');
const router = express.Router();
router.post('/', authenticate, validateRequest(createInvoiceSchema), checkCompanyAccess, controller.create);
router.get('/', authenticate, validateQuery(invoiceQuerySchema), checkCompanyAccess, controller.list);
router.get('/:id/pdf', authenticate, checkCompanyAccess, controller.pdf);
router.get('/:id', authenticate, checkCompanyAccess, controller.get);
router.put('/:id', authenticate, (req, res, next) => {
  const result = updateInvoiceSchema.safeParse(req.body);
  if (!result.success) {
    req.body = req.body || {};
    return next();
  }
  req.body = result.data;
  next();
}, checkCompanyAccess, controller.update);
router.delete('/:id', authenticate, checkCompanyAccess, controller.cancel);
module.exports = router;
