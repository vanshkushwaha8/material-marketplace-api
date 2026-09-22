const mongoose = require('mongoose');

// Self-declared storefront tags a Business/Store seller sells under,
// shown as checkboxes on registration and the seller's Store Profile
// page. Deliberately its own admin-managed collection — separate from
// material_categories (which governs listing creation/spec validation,
// see materialCategory.schema.js) — same reasoning the old hardcoded
// STORE_CATEGORIES enum documented: these are broader storefront labels,
// not a listing's actual category.
const storeCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    is_deleted: { type: String, enum: ['0', '1'], default: '0', index: true },
  },
  { timestamps: true }
);

module.exports = storeCategorySchema;
