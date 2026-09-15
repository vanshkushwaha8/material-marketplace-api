const mongoose = require('mongoose');

/**
 * Not one of the 5 schemas the implementation blueprint lists — added
 * because without it, a day with genuinely zero reconciliation breaks
 * produces zero documents anywhere, which looks IDENTICAL to the daily
 * job having silently failed to run at all. For a financial control
 * whose entire job is catching breaks, "we checked and found nothing
 * wrong" and "we never checked" must be distinguishable, so this exists
 * specifically to make every day's run visible regardless of outcome.
 */
const reconRunSchema = new mongoose.Schema(
  {
    runDate: { type: Date, required: true, index: true },
    source: { type: String, enum: ['PSP_STATEMENT', 'manual_review_required'], required: true },
    matchedCount: { type: Number, default: 0 },
    exceptionCount: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = reconRunSchema;
