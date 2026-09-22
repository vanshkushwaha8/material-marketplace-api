const mongoose = require('mongoose');

// The kind of business a Business/Store seller runs (e.g. "Hardware
// Store", "Cement Dealer") — shown as a single-select on registration
// and the seller's Store Profile page. Previously a hardcoded
// BUSINESS_TYPES enum; now admin-managed so new business types don't
// require a deploy.
const businessTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    is_deleted: { type: String, enum: ['0', '1'], default: '0', index: true },
  },
  { timestamps: true }
);

module.exports = businessTypeSchema;
