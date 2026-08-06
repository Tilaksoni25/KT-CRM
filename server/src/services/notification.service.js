const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const ReminderConfig = require('../models/ReminderConfig');
const Alert = require('../models/Alert');

const serviceError = (message, statusCode, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });
const id = (value) => value?.toString();

// TODO: wire persisted Notification records to the email/SMS/WhatsApp channel
// worker. This module intentionally records delivery intent only.

const listNotifications = async (userId, filters = {}) => {
  const query = { userId };
  if (filters.read !== undefined) query.read = filters.read;
  if (filters.type) query.type = filters.type;
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const notifications = await Notification.find(query).sort({ createdAt: -1 }).lean();
  return notifications.map((notification) => ({
    id: id(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    companyId: notification.companyId ? id(notification.companyId) : null,
    read: notification.read,
    channel: notification.channel,
    meta: notification.meta || {},
    createdAt: notification.createdAt,
    readAt: notification.readAt || null
  }));
};

const markNotificationRead = async (notificationId, userId) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw serviceError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
  }
  const notification = await Notification.findOne({ _id: notificationId, userId });
  if (!notification) throw serviceError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');

  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return { id: id(notification._id), read: notification.read, readAt: notification.readAt };
};

const createReminderConfig = async (data, userId) => {
  // TODO: hook this config into a cron/queue worker that scans GST, invoices,
  // AMCs and renewals and materializes Reminder and Notification records.
  const config = await ReminderConfig.create({ ...data, createdBy: userId, updatedBy: userId });
  return {
    id: id(config._id),
    companyId: id(config.companyId),
    type: config.type,
    daysBefore: config.daysBefore,
    enabled: config.enabled,
    channels: config.channels,
    config: config.config || {},
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  };
};

const listReminders = async (companyId, filters = {}) => {
  const query = { companyId };
  if (filters.type) query.type = filters.type;
  if (filters.enabled !== undefined) query.enabled = filters.enabled;
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  // TODO: once a scheduler exists, calculate and attach real nextRunAt values.
  const configs = await ReminderConfig.find(query).sort({ createdAt: -1 }).lean();
  return configs.map((config) => ({
    id: id(config._id),
    type: config.type,
    daysBefore: config.daysBefore,
    enabled: config.enabled,
    channels: config.channels,
    nextRunAt: null,
    config: config.config || {}
  }));
};

const listActiveAlerts = async (companyId, filters = {}) => {
  const query = { companyId, isActive: true, acknowledged: filters.acknowledged ?? false };
  if (filters.type) query.type = filters.type;
  if (filters.severity) query.severity = filters.severity;

  // TODO: generate alerts from Module 18 Inventory, Module 4 Bank & Cash,
  // and Module 8 Sales Invoice via an event consumer or background job.
  const alerts = await Alert.find(query).sort({ createdAt: -1 }).lean();
  const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).map((alert) => ({
    id: id(alert._id),
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    meta: alert.meta || {},
    acknowledged: alert.acknowledged,
    acknowledgedBy: alert.acknowledgedBy ? id(alert.acknowledgedBy) : null,
    acknowledgedAt: alert.acknowledgedAt || null,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  }));
};

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
  return { id: id(alert._id), acknowledged: alert.acknowledged, acknowledgedBy: id(alert.acknowledgedBy), acknowledgedAt: alert.acknowledgedAt };
};

module.exports = { listNotifications, markNotificationRead, createReminderConfig, listReminders, listActiveAlerts, getAlert, acknowledgeAlert };
