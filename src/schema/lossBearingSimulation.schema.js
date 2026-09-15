const mongoose = require('mongoose');

const lossBearingSimulationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    // Art 21(5)(a)-(c) inputs.
    regularIncome: { type: Number, required: true, min: 0 },
    totalIncome: { type: Number, required: true, min: 0 },
    incomeIsPermanent: { type: Boolean, required: true },
    // Financial investments + cash deposits ONLY — real property and pension
    // assets are explicitly excluded per Art 21(5)(b); enforced at the
    // service layer input contract, not representable/checkable in the schema
    // itself, so the exclusion guidance is documented here for anyone editing
    // the write path.
    totalFinancialAssets: { type: Number, required: true, min: 0 },
    totalFinancialCommitments: { type: Number, required: true, min: 0 },
    computedNetWorth: { type: Number, required: true },
    simulatedCapacity: { type: Number, required: true },
    // A-04: true when raw commitments exceeded assets before clamping to 0
    // — a distinct, worth-flagging situation from a simple break-even case.
    negativeNetWorth: { type: Boolean, default: false },
    acknowledgedText: { type: String },
    acknowledgedAt: { type: Date },
    completedAt: { type: Date, default: Date.now },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

lossBearingSimulationSchema.index({ userId: 1, completedAt: -1 });

module.exports = lossBearingSimulationSchema;
