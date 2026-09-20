const mongoose = require('mongoose');
const { REQUIREMENT_STATES } = require('../constants/requirement.constants');
const deleteConstants = require('../constants/delete.constants');

const requirementSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    material: { type: String, required: true, trim: true },
    quantity: { type: String, required: true, trim: true }, // free text ("10 MT") — matches the existing UI's free-text field, not the structured Listing quantity/unit
    spec: { type: String, trim: true, default: '' },
    deliveryLocation: { type: String, required: true, trim: true },
    status: { type: String, enum: Object.values(REQUIREMENT_STATES), default: REQUIREMENT_STATES.ACTIVE, index: true },
    responseCount: { type: Number, default: 0 },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

requirementSchema.index({ status: 1, createdAt: -1 });
module.exports = requirementSchema;