const mongoose = require('mongoose');
const { LISTING_STATES, VERIFICATION_STATES, CONDITION_TYPES } = require('../constants/materialListing.constants');
const { MATERIAL_UNITS } = require('../constants/materialUnit.constants');
const deleteConstants = require('../constants/delete.constants');

// Media metadata only — never binary data (spec section 8). Files
// themselves live under public/materialListingMedia via the existing
// temp-upload -> helper.moveFileFromFolder() pipeline, same as every
// other upload in this codebase.
const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);
const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    width: { type: Number },
    height: { type: Number },
    duration: { type: Number, default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const materialListingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

    title: { type: String, required: true, trim: true },
    slugUrl: { type: String, trim: true },
    description: { type: String, trim: true, default: '' },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'material_categories', required: true, index: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'material_categories', default: null },
    brand: { type: String, trim: true, default: '' },
    condition: { type: String, enum: Object.values(CONDITION_TYPES), required: true },

    quantity: { type: Number, required: true, min: 0 },
    availableQuantity: { type: Number, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    soldQuantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, enum: MATERIAL_UNITS, required: true },

    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    negotiable: { type: Boolean, default: true },

    // Category-specific structured data (spec section 7), validated
    // per-category by validation/app/materialSpecs.validation.js rather
    // than by a fixed mongoose shape — this is what lets new categories
    // be added without a schema migration.
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },

    manufacturingDate: { type: Date, default: null },
    purchaseDate: { type: Date, default: null },

        location: {
      city: { type: String, trim: true, required: true },
      state: { type: String, trim: true, required: true },
      pincode: { type: String, trim: true },
      area: { type: String, trim: true, default: '' },
      // A real GeoJSON sub-schema, not a plain nested object — the plain
      // object version above always got auto-instantiated by Mongoose
      // (defaults on nested paths apply unconditionally), producing an
      // invalid `{ type: 'Point' }` with no coordinates on every save,
      // which the 2dsphere index below then rejected. `default: undefined`
      // on a Schema-typed field is what actually makes it optional.
      geo: { type: geoPointSchema, default: undefined },
    },

    images: { type: [mediaSchema], default: [] },
    videos: { type: [mediaSchema], default: [] },
    invoiceProof: { type: mediaSchema, default: null },

    status: { type: String, enum: Object.values(LISTING_STATES), default: LISTING_STATES.DRAFT, index: true },
    verificationStatus: { type: String, enum: Object.values(VERIFICATION_STATES), default: VERIFICATION_STATES.UNVERIFIED, index: true },
    verificationNote: { type: String, trim: true, default: '' },
    rejectionReason: { type: String, trim: true, default: '' },

    stateHistory: [
      {
        fromStatus: { type: String, default: null },
        toStatus: { type: String, default: null },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
        changedByType: { type: String, enum: ['seller', 'admin', 'system'], default: 'system' },
        reason: { type: String, trim: true, default: '' },
      },
    ],

    viewCount: { type: Number, default: 0 },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

materialListingSchema.index({ title: 'text', description: 'text', brand: 'text' });
materialListingSchema.index({ 'location.geo': '2dsphere' });
materialListingSchema.index({ status: 1, verificationStatus: 1, category: 1, price: 1, createdAt: -1 });
// New listings start fully available; existing listings are backfilled
// by scripts/backfillListingInventory.js.
materialListingSchema.pre('validate', function (next) {
  if (this.isNew && this.availableQuantity == null) {
    this.availableQuantity = this.quantity;
  }
  next();
});
module.exports = materialListingSchema;
