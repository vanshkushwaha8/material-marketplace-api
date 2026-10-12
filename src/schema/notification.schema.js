const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../constants/notification.constants');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    // Who performed the action that triggered this notification — null for
    // system-generated events (payout paid, payment failed at the provider,
    // etc.) that have no human actor. Denormalized `actorName` is stored
    // alongside so the notification list/history still reads correctly even
    // if the actor later renames themselves or is deleted.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
    actorName: { type: String, default: null, trim: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // What this notification is about — lets the frontend deep-link
    // straight to the offer/transaction/payout/requirement instead of just a bell icon.
    entityType: { type: String, enum: ['offer', 'transaction', 'payout', 'listing', 'requirement'], default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Human-readable name of the entity (listing title, requirement
    // material, etc.) — denormalized at creation time so the notification
    // is self-contained and doesn't need a populate() to render.
    entityName: { type: String, default: null, trim: true },
    // One notification per business event: e.g. "HANDOVER_STARTED:<txnId>".
    // A retried request, a duplicate webhook or a racing callback hits the
    // unique index instead of creating a second copy. No default — the
    // sparse index only covers notifications that set it.
    dedupeKey: { type: String, trim: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
module.exports = notificationSchema;