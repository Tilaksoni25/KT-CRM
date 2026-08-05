const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const ReminderConfig = require('../models/ReminderConfig');
const Reminder = require('../models/Reminder');
const Alert = require('../models/Alert');

const serviceError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const listNotifications = async (userId) => Notification.find({ userId }).sort({ createdAt: -1 }).lean();

const markNotificationRead = async (notificationId, userId) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw serviceError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  }
  const notification = await Notification.findById(notificationId);
  if (!notification) throw serviceError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  if (notification.userId.toString() !== userId.toString()) {
    throw serviceError('You cannot modify another user\'s notification', 403, 'FORBIDDEN');
  }
  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return { id: notification._id, read: notification.read };
};

const createReminderConfig = async (data, userId) => {
  const config = await ReminderConfig.create({ ...data, createdBy: userId, updatedBy: userId });
  return {
    id: config._id,
    companyId: config.companyId,
    type: config.type,
    daysBefore: config.daysBefore,
    enabled: config.enabled,
    channels: config.channels
  };
};

/**
 * TODO: Module 20 scheduler should materialize enabled ReminderConfig rules
 * into Reminder records. Until then this safely returns any pre-created
 * reminders and an empty list when no scheduler is installed.
 */
const listReminders = async (companyId) => Reminder.find({ companyId, status: 'scheduled' })
  .sort({ nextRunAt: 1, createdAt: -1 }).lean();

/**
 * TODO: Generate alerts from Module 8 invoices, Module 10 purchases, Module
 * 18 inventory, Module 19 assets, Module 25 GST, and Module 21 workflows.
 */
const listActiveAlerts = async (companyId) => Alert.find({ companyId, isActive: true, acknowledged: false })
  .sort({ createdAt: -1 }).lean();

const getAlert = async (alertId) => {
  if (!mongoose.isValidObjectId(alertId)) throw serviceError('Alert not found', 404, 'ALERT_NOT_FOUND');
  const alert = await Alert.findById(alertId).lean();
  if (!alert) throw serviceError('Alert not found', 404, 'ALERT_NOT_FOUND');
  return alert;
};

const acknowledgeAlert = async (alertId, userId) => {
  if (!mongoose.isValidObjectId(alertId)) throw serviceError('Alert not found', 404, 'ALERT_NOT_FOUND');
  const alert = await Alert.findById(alertId);
  if (!alert) throw serviceError('Alert not found', 404, 'ALERT_NOT_FOUND');
  if (!alert.acknowledged) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
    await alert.save();
  }
  return { alert, data: { id: alert._id, acknowledged: alert.acknowledged } };
};

module.exports = {
  listNotifications,
  markNotificationRead,
  createReminderConfig,
  listReminders,
  listActiveAlerts,
  getAlert,
  acknowledgeAlert
};
