const mongoose = require('mongoose');

// Delivery vehicle classes (Pickup, Tata Ace, 10-wheeler, Tipper …) —
// admin-managed like business_types so a new class needs no deploy. Orders
// snapshot {code, name, maxPayloadKg} when they reference one, so editing
// or deactivating a vehicle never changes what an order recorded.
//
// maxPayloadKg drives the system recommendation (smallest autoRecommend
// vehicle that carries the order's weight). Special-purpose vehicles
// (tipper, dumper) and "Other" are buyer/seller choices only.
const vehicleTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, immutable: true, match: /^[A-Z0-9_]{2,40}$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    maxPayloadKg: { type: Number, min: 0, default: null },
    autoRecommend: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

vehicleTypeSchema.index({ active: 1, sortOrder: 1 });

module.exports = vehicleTypeSchema;
