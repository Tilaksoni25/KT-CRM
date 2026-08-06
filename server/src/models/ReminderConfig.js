const mongoose = require('mongoose');

const reminderConfigSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, required: true, trim: true },
  daysBefore: { type: Number, required: true, min: 1 },
  enabled: { type: Boolean, default: true },
  channels: { type: [{ type: String, enum: ['BELL', 'EMAIL', 'SMS', 'WHATSAPP'] }], default: ['BELL'] },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

reminderConfigSchema.index({ companyId: 1, type: 1 });

module.exports = mongoose.model('ReminderConfig', reminderConfigSchema);
