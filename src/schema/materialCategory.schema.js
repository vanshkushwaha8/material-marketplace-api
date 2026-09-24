const mongoose = require('mongoose');

// Flat category/subcategory taxonomy (self-referencing parent), replacing
// the old project_reference_data lookup-list pattern for the marketplace
// domain. specFields documents which keys the category's spec form should
// show — actual validation of those keys still lives centrally in
// materialSpecs.validation.js (spec section 7's "add categories without
// rewriting the listing system" requirement), this is presentation-only.

const specFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: ['text', 'number', 'date'], default: 'text' },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);
const materialCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'material_categories', default: null, index: true },
    description: { type: String, trim: true, default: '' },
    logo: { type: String, trim: true, default: '' },
    specFields: { type: [specFieldSchema], default: [] },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    is_deleted: { type: String, enum: ['0', '1'], default: '0', index: true },
  },
  { timestamps: true }
);

module.exports = materialCategorySchema;
