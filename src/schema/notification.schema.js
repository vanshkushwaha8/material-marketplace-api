const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../constants/notification.constants');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // What this notification is about — lets the frontend deep-link
    // straight to the offer/transaction/payout instead of just a bell icon.
    entityType: { type: String, enum: ['offer', 'transaction', 'payout', 'listing'], default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
module.exports = notificationSchema;