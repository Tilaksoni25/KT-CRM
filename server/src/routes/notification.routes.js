const express = require('express');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const {
  createReminderConfigSchema,
  notificationQuerySchema,
  companyQuerySchema,
  validateQuery
} = require('../validators/notification.validators');
const notificationController = require('../controllers/notification.controller');

const router = express.Router();

router.get('/notifications', authenticate, validateQuery(notificationQuerySchema), notificationController.listNotifications);
router.put('/notifications/:id/read', authenticate, notificationController.markNotificationRead);
router.post('/reminders/config', authenticate, validateRequest(createReminderConfigSchema), checkCompanyAccess, notificationController.createReminderConfig);
router.get('/reminders', authenticate, validateQuery(companyQuerySchema), checkCompanyAccess, notificationController.listReminders);
router.get('/alerts', authenticate, validateQuery(companyQuerySchema), checkCompanyAccess, notificationController.listAlerts);
router.put('/alerts/:id/acknowledge', authenticate, notificationController.acknowledgeAlert);

module.exports = router;
