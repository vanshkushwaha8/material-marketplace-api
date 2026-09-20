const mongoose = require('mongoose');
const { REVIEWER_ROLES } = require('../constants/review.constants');
const deleteConstants = require('../constants/delete.constants');

// One review per (transaction, reviewerRole) — a completed transaction can
// carry at most a buyer→seller review AND a seller→buyer review, never two
// of the same direction (the unique index below enforces this).
const reviewSchema = new mongoose.Schema(
  {
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'transactions', required: true, index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
    reviewerRole: { type: String, enum: Object.values(REVIEWER_ROLES), required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

reviewSchema.index({ transaction: 1, reviewerRole: 1 }, { unique: true });
module.exports = reviewSchema;