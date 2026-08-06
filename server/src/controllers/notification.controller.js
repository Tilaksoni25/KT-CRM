const notificationService = require('../services/notification.service');

const listNotifications = async (req, res, next) => {
  try {
    const { userId, ...filters } = req.query;
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only view your own notifications', errorCode: 'FORBIDDEN' });
    }
    const items = await notificationService.listNotifications(userId, filters);
    return res.status(200).json({ success: true, data: { userId, items } });
  } catch (error) { next(error); }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const data = await notificationService.markNotificationRead(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

const createReminderConfig = async (req, res, next) => {
  try {
    const data = await notificationService.createReminderConfig(req.body, req.user._id);
    return res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

const listReminders = async (req, res, next) => {
  try {
    const { companyId, ...filters } = req.query;
    const items = await notificationService.listReminders(companyId, filters);
    return res.status(200).json({ success: true, data: { companyId, items } });
  } catch (error) { next(error); }
};

const listAlerts = async (req, res, next) => {
  try {
    const { companyId, ...filters } = req.query;
    const items = await notificationService.listActiveAlerts(companyId, filters);
    return res.status(200).json({ success: true, data: { companyId, items } });
  } catch (error) { next(error); }
};

const acknowledgeAlert = async (req, res, next) => {
  try {
    const data = await notificationService.acknowledgeAlert(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

module.exports = { listNotifications, markNotificationRead, createReminderConfig, listReminders, listAlerts, acknowledgeAlert };
