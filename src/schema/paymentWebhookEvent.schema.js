const mongoose = require('mongoose');

// Pure idempotency ledger — the unique index below is the actual
// duplicate-webhook guard. A second delivery of the same provider event
// hits E11000 on insert and is treated as "already processed."
const paymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = paymentWebhookEventSchema;