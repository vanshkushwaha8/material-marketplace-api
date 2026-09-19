const mongoose = require('mongoose');
const { PAYMENT_STATES } = require('../constants/payment.constants');
const deleteConstants = require('../constants/delete.constants');

// One document per payment ORDER attempt against a transaction (a buyer
// can retry after a failure, producing a second Payment doc — the
// transaction only ever advances on a SUCCESS one). Never stores card/
// bank details — only the provider's own opaque order/payment ids.
const paymentSchema = new mongoose.Schema(
  {
    // No inline `index: true` here — the partial unique index below (plus
    // the general {transaction:1,createdAt:-1} one) already cover it;
    // declaring both ways triggers a duplicate-schema-index warning since
    // they'd share the exact {transaction:1} key pattern.
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'transactions', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true, index: true },
    providerPaymentId: { type: String },

    amountPaise: { type: Number, required: true, min: 0 }, // backend-authoritative, never from the frontend
    currency: { type: String, default: 'INR' },
    method: { type: String, default: null }, // upi | card | netbanking | wallet | manual ...

    status: { type: String, enum: Object.values(PAYMENT_STATES), default: PAYMENT_STATES.CREATED, index: true },
    failureReason: { type: String, trim: true, default: '' },

    refunds: [
      {
        providerRefundId: { type: String },
        amountPaise: { type: Number },
        status: { type: String },
        initiatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null },
        at: { type: Date, default: Date.now },
      },
    ],

    history: [
      { action: { type: String, required: true }, note: { type: String, trim: true, default: '' }, at: { type: Date, default: Date.now } },
    ],

    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });
// Closes the "double-click Proceed to Payment" race at the database level:
// at most one non-terminal (CREATED/PENDING/PROCESSING) payment doc may
// exist per transaction, so two near-simultaneous order-creation requests
// can't both win — the loser's insert throws E11000 and the caller
// (payment.service.js) falls back to the winning order.
paymentSchema.index(
  { transaction: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] } } }
);
// General (non-partial, non-unique) lookup index — admin history queries
// and any "all payments for this transaction, including terminal ones"
// read.
paymentSchema.index({ transaction: 1, createdAt: -1 });

module.exports = paymentSchema;