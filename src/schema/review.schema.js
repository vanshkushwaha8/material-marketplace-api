const mongoose = require('mongoose');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../constants/review.constants');
const deleteConstants = require('../constants/delete.constants');

// One review per (transaction, reviewerRole) — a completed transaction (the
// "order") can carry at most a buyer→seller rating AND a seller→buyer
// rating, never two of the same direction (unique index below). A buyer
// who buys from the same seller again gets a new transaction and so can
// rate that order independently.
//
// Ownership fields (reviewer / reviewee / transaction / reviewerRole) are
// set by the server from the transaction itself and are never updatable.
const reviewSchema = new mongoose.Schema(
  {
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'transactions', required: true, index: true, immutable: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, immutable: true },
    reviewerRole: { type: String, enum: Object.values(REVIEWER_ROLES), required: true, immutable: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true, immutable: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    editedAt: { type: Date, default: null },

    status: { type: String, enum: Object.values(REVIEW_STATUS), default: REVIEW_STATUS.ACTIVE, index: true },
    moderation: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null },
      reason: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
    },

    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

reviewSchema.index({ transaction: 1, reviewerRole: 1 }, { unique: true });
// Seller rating summary / public review list: reviews ABOUT a seller from buyers.
reviewSchema.index({ reviewee: 1, reviewerRole: 1, status: 1, createdAt: -1 });
module.exports = reviewSchema;
