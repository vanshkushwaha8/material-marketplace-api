const mongoose = require('mongoose');
const { PAYOUT_STATES } = require('../constants/payout.constants');
const deleteConstants = require('../constants/delete.constants');

// One payout per completed transaction. Financial fields are a snapshot
// taken at eligibility time — same immutability rule as Transaction's own
// commission snapshot; never recalculated from current rates.
const payoutSchema = new mongoose.Schema(
  {
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'transactions', required: true, unique: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    sellerBankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'seller_bank_accounts', default: null },

    grossAmount: { type: Number, required: true, min: 0 },
    platformCommissionAmount: { type: Number, required: true, min: 0 },
    paymentProcessingFeeAmount: { type: Number, required: true, min: 0, default: 0 },
    netPayoutAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: { type: String, enum: Object.values(PAYOUT_STATES), default: PAYOUT_STATES.PENDING, index: true },
    eligibleAt: { type: Date, default: null },

    provider: { type: String, default: null },
    providerPayoutId: { type: String, default: null, index: true },
    providerPayoutStatus: { type: String, default: '' },
    failureReason: { type: String, trim: true, default: '' },
    processedAt: { type: Date, default: null },

    history: [{ action: { type: String, required: true }, note: { type: String, trim: true, default: '' }, at: { type: Date, default: Date.now } }],
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

payoutSchema.index({ status: 1, createdAt: -1 });
module.exports = payoutSchema;