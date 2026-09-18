const mongoose = require('mongoose');
const { OFFER_STATES, DEFAULT_OFFER_EXPIRY_HOURS } = require('../constants/offer.constants');
const deleteConstants = require('../constants/delete.constants');

// One document per negotiation thread on a listing (spec section 18) —
// history[] keeps every offer/counter/accept/reject as an immutable log
// rather than overwriting amount/status in place, so a dispute or admin
// review can reconstruct exactly what was agreed and when.
const offerSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'material_listings', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

    listedPrice: { type: Number, required: true }, // snapshot at time of first offer
    quantity: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, required: true },
    lastActionBy: { type: String, enum: ['buyer', 'seller'], required: true },

    status: { type: String, enum: Object.values(OFFER_STATES), default: OFFER_STATES.PENDING, index: true },

        history: [
      {
        version: { type: Number, required: true },
        action: { type: String, enum: ['OFFER', 'COUNTER', 'ACCEPT', 'REJECT', 'CANCEL', 'EXPIRE'], required: true },
        by: { type: String, enum: ['buyer', 'seller', 'system'], required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
        amount: { type: Number, default: null },
        unitPrice: { type: Number, default: null },
        message: { type: String, trim: true, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],

    expiresAt: { type: Date, required: true },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

offerSchema.statics.DEFAULT_EXPIRY_HOURS = DEFAULT_OFFER_EXPIRY_HOURS;
offerSchema.index({ listing: 1, buyer: 1, status: 1 });

module.exports = offerSchema;
