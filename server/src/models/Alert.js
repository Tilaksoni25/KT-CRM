const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  isActive: { type: Boolean, default: true, index: true },
  acknowledged: { type: Boolean, default: false, index: true },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

alertSchema.index({ companyId: 1, isActive: 1, acknowledged: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
