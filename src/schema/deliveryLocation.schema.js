const mongoose = require('mongoose');
const deleteConstants = require('../constants/delete.constants');

// A buyer's saved delivery address book — free-text label/address only
// (no lat/lng captured here), same as the "Nearby Materials" search which
// never persists the buyer's precise coordinates either. One buyer can
// have many; exactly one is `isDefault` at a time whenever the list is
// non-empty (enforced in the service layer, not here).
const deliveryLocationSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    isDefault: { type: Boolean, default: false },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

deliveryLocationSchema.index({ buyer: 1, is_deleted: 1, createdAt: -1 });

module.exports = deliveryLocationSchema;
