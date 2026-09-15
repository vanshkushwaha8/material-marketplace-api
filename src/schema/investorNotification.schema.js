const mongoose = require('mongoose');

/**
 * OPL-345 AC3/AC4 — there was no existing record of "what has this
 * investor been sent" anywhere in the codebase (no notification/message
 * model at all). This is the minimal record needed for two things:
 *   - AC3: the drill-down's "communications" tab has something real to show
 *     rather than being empty by construction.
 *   - AC4: a bulk notification send needs a per-recipient record so the
 *     Communications tab and the audit trail agree on what actually went
 *     out, not just "an admin clicked send."
 *
 * Deliberately NOT a general-purpose messaging/thread system (see
 * reviewThread on project.schema.js for that shape) — this is one-way,
 * admin-to-investor, fire-and-forget notices (status changes, bulk
 * campaigns), not a two-way conversation.
 */
const investorNotificationSchema = new mongoose.Schema(
  {
    investorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    channel: {
      type: String,
      enum: ['email'],
      default: 'email',
    },
    // 'account_action' = system-generated (e.g. "your account was
    // suspended") vs 'bulk' = an admin-authored campaign sent to many
    // investors at once (AC4). Kept distinct so the Communications tab can
    // label them differently without guessing from free text.
    origin: {
      type: String,
      enum: ['account_action', 'bulk'],
      required: true,
    },
    // Groups every per-recipient row from the same bulk send together —
    // null for account-action notices, which are always singular.
    batchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    sentByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'admins',
      required: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

investorNotificationSchema.index({ investorId: 1, createdAt: -1 });

module.exports = investorNotificationSchema;
