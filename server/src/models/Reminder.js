const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  configId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReminderConfig', default: null },
  type: { type: String, required: true, trim: true },
  nextRunAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['scheduled', 'sent', 'cancelled'], default: 'scheduled' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

reminderSchema.index({ companyId: 1, status: 1, nextRunAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
