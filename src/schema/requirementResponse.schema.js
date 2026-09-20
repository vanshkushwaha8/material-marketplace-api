const mongoose = require('mongoose');
const deleteConstants = require('../constants/delete.constants');

// A seller's quote against a buyer's Requirement — deliberately separate
// from Offer/Listing since there's no listing to attach to yet at this stage.
const requirementResponseSchema = new mongoose.Schema(
  {
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'requirements', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    message: { type: String, required: true, trim: true },
    quotedPrice: { type: Number, min: 0, default: null },
    quotedQuantity: { type: String, trim: true, default: '' },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

requirementResponseSchema.index({ requirement: 1, seller: 1 }, { unique: true }); // one quote per seller per requirement
module.exports = requirementResponseSchema;