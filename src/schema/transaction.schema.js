const mongoose = require('mongoose');
const { TRANSACTION_STATES, SETTLEMENT_STATES } = require('../constants/transaction.constants');
const deleteConstants = require('../constants/delete.constants');

// Created the moment an offer is mutually ACCEPTED. Snapshots the agreed
// commercial terms (agreedQuantity/agreedAmount/unitPrice) so later edits
// to the listing/offer never retroactively change what was actually
// bought — spec section "LISTING PRICE CHANGES".
const transactionSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'material_listings', required: true, index: true },
    offer: { type: mongoose.Schema.Types.ObjectId, ref: 'offers', required: true, unique: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

    agreedQuantity: { type: Number, required: true, min: 0 },
    agreedAmount: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },

    status: { type: String, enum: Object.values(TRANSACTION_STATES), default: TRANSACTION_STATES.PAYMENT_PENDING, index: true },

    // Inventory held for this transaction only until this timestamp —
    // see transaction.service.js#expireStaleReservations.
    reservationExpiresAt: { type: Date, required: true },

    paymentConfirmedAt: { type: Date, default: null },
    handoverStartedAt: { type: Date, default: null },
    buyerConfirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    platformCommissionPct: { type: Number, default: null },   // rate actually applied, snapshotted
    platformCommissionAmount: { type: Number, default: null },
    sellerSettlementAmount: { type: Number, default: null },
    settlementStatus: { type: String, enum: Object.values(SETTLEMENT_STATES), default: SETTLEMENT_STATES.PENDING },

    disputed: { type: Boolean, default: false },
    disputeReason: { type: String, trim: true, default: '' },

    history: [
      {
        action: { type: String, required: true },
        by: { type: String, enum: ['buyer', 'seller', 'admin', 'system'], required: true },
        note: { type: String, trim: true, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],

    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

transactionSchema.index({ status: 1, reservationExpiresAt: 1 });

module.exports = transactionSchema;