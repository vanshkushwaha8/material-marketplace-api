const mongoose = require('mongoose');
const { SELLER_TYPES } = require('../constants/sellerType.constants');

// Platform commission, per seller type, as an append-only version history.
// Every admin change inserts a NEW document; the current rate for a seller
// type is the latest document for it. Transactions store the _id of the
// version that priced them (transaction.commissionSetting), so changing the
// rate never alters an existing transaction's commission.
const commissionSettingSchema = new mongoose.Schema(
  {
    sellerType: { type: String, enum: Object.values(SELLER_TYPES), required: true, immutable: true },
    pct: { type: Number, required: true, min: 0, max: 50, immutable: true },
    previousPct: { type: Number, default: null, immutable: true },
    reason: { type: String, trim: true, default: '', immutable: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null, immutable: true },
  },
  { timestamps: true }
);

commissionSettingSchema.index({ sellerType: 1, createdAt: -1 });
module.exports = commissionSettingSchema;
