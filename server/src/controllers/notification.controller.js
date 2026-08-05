const Company = require('../models/Company');
const notificationService = require('../services/notification.service');

const canAccessCompany = async (user, companyId) => {
  const company = await Company.findById(companyId).select('createdBy');
  if (!company) return false;
  if (company.createdBy.toString() === user._id.toString()) return true;
  if (user.companyId?.toString() === companyId.toString()) return true;
  return user.companyAccess.some((access) => access.isActive && access.companyId.toString() === companyId.toString());
};

const listNotifications = async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only view your own notifications', errorCode: 'FORBIDDEN' });
    }
    const items = await notificationService.listNotifications(userId);
    return res.status(200).json({ success: true, data: { userId, items } });
  } catch (error) {
    next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const data = await notificationService.markNotificationRead(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createReminderConfig = async (req, res, next) => {
  try {
    const data = await notificationService.createReminderConfig(req.body, req.user._id);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const listReminders = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const items = await notificationService.listReminders(companyId);
    return res.status(200).json({ success: true, data: { companyId, items } });
  } catch (error) {
    next(error);
  }
};

const listAlerts = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const items = await notificationService.listActiveAlerts(companyId);
    return res.status(200).json({ success: true, data: { companyId, items } });
  } catch (error) {
    next(error);
  }
};

const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await notificationService.getAlert(req.params.id);
    if (!await canAccessCompany(req.user, alert.companyId)) {
      return res.status(403).json({ success: false, message: 'Access denied to this alert', errorCode: 'FORBIDDEN' });
    }
    const { data } = await notificationService.acknowledgeAlert(req.params.id, req.user._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listNotifications,
  markNotificationRead,
  createReminderConfig,
  listReminders,
  listAlerts,
  acknowledgeAlert
};
