const mongoose = require('mongoose');
const { PAYMENT_STATES } = require('../constants/payment.constants');
const deleteConstants = require('../constants/delete.constants');

// One document per payment ORDER attempt against a transaction (a buyer
// can retry after a failure, producing a second Payment doc — the
// transaction only ever advances on a SUCCESS one). Never stores card/
// bank details — only the provider's own opaque order/payment ids.
const paymentSchema = new mongoose.Schema(
  {
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'transactions', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true, index: true },
    providerPaymentId: { type: String, default: null },

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

module.exports = paymentSchema;