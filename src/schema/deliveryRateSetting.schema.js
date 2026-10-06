const mongoose = require('mongoose');

// Platform delivery rate card, append-only like commissionSetting: every
// admin change inserts a NEW document and the latest one is current. A
// transaction snapshots the charge it was quoted (transaction.deliveryCharge
// + fulfilment.rateSetting), so a later change never alters an order.
//   charge = baseCharge + perKm × distanceKm + perKg × weightKg
// Orders farther than maxDistanceKm from the store can't choose delivery.
const deliveryRateSettingSchema = new mongoose.Schema(
  {
    baseCharge: { type: Number, required: true, min: 0, immutable: true },
    perKm: { type: Number, required: true, min: 0, immutable: true },
    perKg: { type: Number, required: true, min: 0, immutable: true },
    maxDistanceKm: { type: Number, required: true, min: 1, immutable: true },
    reason: { type: String, trim: true, default: '', immutable: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null, immutable: true },
  },
  { timestamps: true }
);

deliveryRateSettingSchema.index({ createdAt: -1 });
module.exports = deliveryRateSettingSchema;
