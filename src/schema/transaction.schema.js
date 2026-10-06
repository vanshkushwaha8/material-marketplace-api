const mongoose = require('mongoose');
const { TRANSACTION_STATES, SETTLEMENT_STATES, COMMISSION_STATES } = require('../constants/transaction.constants');
const deleteConstants = require('../constants/delete.constants');
const { ESCROW_STATES, ESCROW_PENDING_OPERATIONS, ESCROW_ACTORS } = require('../constants/escrow.constants');

// One row per escrow transition — the financial audit trail shown to the
// buyer, seller and admin. Written ONLY by escrow.service.js#transition.
const escrowEventSchema = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    action: { type: String, required: true },
    actorType: { type: String, enum: Object.values(ESCROW_ACTORS), required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, trim: true, default: '' },
    providerRef: { type: String, default: '' }, // provider payment / refund / payout id
    amount: { type: Number, default: null },
    idempotencyKey: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Same shape as material_listings' mediaSchema — handover evidence is
// uploaded through the same generic upload endpoint as listing media.
const handoverMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String },
  },
  { _id: false }
);

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
        currency: { type: String, default: 'INR' },

    // Buyer convenience fee, snapshotted at creation: buyerFeePct of
    // agreedAmount, charged on top (totalPayable = agreedAmount + fee).
    // Platform revenue — commission/settlement stay based on agreedAmount.
    // null totalPayable = created before the fee existed (pays agreedAmount).
    buyerFeePct: { type: Number, default: 0 },
    buyerFeeAmount: { type: Number, default: 0 },
    // Delivery charge quoted at checkout (0 for store pickup). Goes to the
    // seller with their settlement — no commission on it.
    // totalPayable = agreedAmount + buyerFeeAmount + deliveryCharge.
    deliveryCharge: { type: Number, default: 0, min: 0 },
    totalPayable: { type: Number, default: null },

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
    commissionStatus: { type: String, enum: Object.values(COMMISSION_STATES), default: COMMISSION_STATES.PENDING, index: true },

    // ---- Escrow (authoritative money state) — see escrow.constants.js ----
    escrowStatus: { type: String, enum: Object.values(ESCROW_STATES), default: ESCROW_STATES.INITIATED, index: true },
    // What a REQUIRES_ADMIN_ACTION / failed state is waiting on.
    escrowPendingOperation: { type: String, enum: [...Object.values(ESCROW_PENDING_OPERATIONS), null], default: null },
    escrowAttentionReason: { type: String, trim: true, default: '' },
    escrowHistory: { type: [escrowEventSchema], default: [] },

    // Commission lock (taken when the payment is captured): which seller
    // type and which admin commission setting produced
    // platformCommissionPct. Later admin changes never touch this.
    commissionSellerType: { type: String, default: null },
    commissionSetting: { type: mongoose.Schema.Types.ObjectId, ref: 'commission_settings', default: null },
    commissionLockedAt: { type: Date, default: null },
    commissionDeductedAt: { type: Date, default: null },
    releaseRequestedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },

    // Full refund of the captured payment (partial refunds are not part of
    // the escrow flow — a provider-side partial refund is flagged for admin).
    refund: {
      status: { type: String, enum: ['NONE', 'PENDING', 'PROCESSED', 'FAILED'], default: 'NONE' },
      amount: { type: Number, default: null },
      providerRefundId: { type: String, default: '' },
      reason: { type: String, trim: true, default: '' },
      requestedAt: { type: Date, default: null },
      requestedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null },
      completedAt: { type: Date, default: null },
      failureReason: { type: String, trim: true, default: '' },
      attempts: { type: Number, default: 0 },
    },

    disputed: { type: Boolean, default: false },
    disputeReason: { type: String, trim: true, default: '' },

    handoverNote: { type: String, trim: true, default: '' },
    handoverEvidence: { type: [handoverMediaSchema], default: [] },

    history: [
      {
        action: { type: String, required: true },
        by: { type: String, enum: ['buyer', 'seller', 'admin', 'system'], required: true },
        note: { type: String, trim: true, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],

    project: { type: mongoose.Schema.Types.ObjectId, ref: 'projects', default: null },

    // OFFER: seller accepted a negotiated offer. BUY_NOW: store product
    // bought at its listed price from the checkout page.
    source: { type: String, enum: ['OFFER', 'BUY_NOW'], default: 'OFFER' },

    // How the buyer gets the material — chosen on the checkout page before
    // payment (required for BUY_NOW, see payment.service#loadPayableTransaction).
    // The address is a snapshot, so a later edit of the buyer's saved
    // address never changes what the seller was told.
    fulfilment: {
      method: { type: String, enum: ['DELIVERY', 'PICKUP', null], default: null },
      addressLabel: { type: String, trim: true, maxlength: 60, default: '' },
      address: { type: String, trim: true, maxlength: 300, default: '' },
      contactName: { type: String, trim: true, maxlength: 80, default: '' },
      contactPhone: { type: String, trim: true, maxlength: 15, default: '' },
      note: { type: String, trim: true, maxlength: 300, default: '' },
      // Delivery pricing snapshot (DELIVERY only): which saved address and
      // map point, how far, how heavy, and the rate card version used.
      deliveryLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'delivery_locations', default: null },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      distanceKm: { type: Number, default: null },
      weightKg: { type: Number, default: null },
      rateSetting: { type: mongoose.Schema.Types.ObjectId, ref: 'delivery_rate_settings', default: null },
      updatedAt: { type: Date, default: null },
    },

    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  // Same reasoning as offer.schema.js — e.g. a dispute raised while the
  // buyer's "confirm receipt" is in flight must not be overwritten by it.
  { timestamps: true, optimisticConcurrency: true }
);

transactionSchema.index({ status: 1, reservationExpiresAt: 1 });
// Admin "needs attention" queue and escrow dashboards.
transactionSchema.index({ escrowStatus: 1, updatedAt: -1 });

module.exports = transactionSchema;