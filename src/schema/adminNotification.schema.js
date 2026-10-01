const mongoose = require('mongoose');
const { ADMIN_NOTIFICATION_TYPES, ADMIN_NOTIFICATION_SEVERITY, ADMIN_NOTIFICATION_CATEGORIES } = require('../constants/adminNotification.constants');

// Admin inbox. Deliberately separate from `notifications` (buyer/seller,
// one row per recipient user): admin events are BROADCAST to every admin
// holding `requiredPermission`, so one document per event with per-admin
// read state (`readBy`) — the admin team is small, and a new sub-admin
// immediately sees the relevant backlog without a fan-out backfill.
const adminNotificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.keys(ADMIN_NOTIFICATION_TYPES), required: true },
    category: { type: String, enum: ADMIN_NOTIFICATION_CATEGORIES, required: true, index: true },
    severity: { type: String, enum: Object.values(ADMIN_NOTIFICATION_SEVERITY), required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // In-app admin route that resolves it (computed server-side).
    link: { type: String, default: null },
    requiredPermission: { type: String, required: true, index: true },
    entityType: { type: String, default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityName: { type: String, default: null, trim: true },
    // Marketplace user involved, if any (seller/buyer), for context.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Collapses noisy repeats (e.g. one "invalid webhook signature" alert
    // per hour, not one per request). Unique when present.
    dedupeKey: { type: String, default: undefined },
    readBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'admins', default: [] },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ requiredPermission: 1, createdAt: -1 });
adminNotificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

module.exports = adminNotificationSchema;
