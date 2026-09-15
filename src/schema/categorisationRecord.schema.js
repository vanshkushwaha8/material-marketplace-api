const mongoose = require('mongoose');

const categorisationRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    category: {
      type: String,
      enum: ['non_sophisticated', 'sophisticated'],
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'default_on_registration',
        'sophistication_approved',
        'sophistication_expired',
        'sophistication_rejected',
        'material_change',
      ],
      required: true,
    },
    validUntil: { type: Date },
    recordedAt: { type: Date, default: Date.now },
    recordedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'admins' },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Full audit trail per user, newest first — this is the append-only ledger
// backing "Given every categorisation decision, an audit record is written".
categorisationRecordSchema.index({ userId: 1, recordedAt: -1 });

module.exports = categorisationRecordSchema;
