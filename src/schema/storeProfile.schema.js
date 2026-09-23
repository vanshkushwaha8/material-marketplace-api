const mongoose = require('mongoose');
const { STORE_VERIFICATION_STATES } = require('../constants/storeProfile.constants');
const deleteConstants = require('../constants/delete.constants');

// Same sub-schema shape as materialListing.schema.js's geoPointSchema.
// IMPORTANT: `coordinates` must be `required: true` *on this sub-schema*
// and the field itself must use `default: undefined` (not inline
// `{ type: {...}, coordinates: { default: undefined } }`) — otherwise
// mongoose auto-instantiates `{ type: 'Point' }` with no coordinates
// on every save with no location captured, which is invalid GeoJSON and
// makes MongoDB reject the write against the 2dsphere index below. This
// was happening here and in user.schema.js/auth.service.js's location
// builder before this fix, and is the actual reason registration failed
// for anyone who didn't grant "Use Current Location".
const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

// One per BUSINESS_STORE seller — created at registration
// (auth.service.js#register) when sellerType === BUSINESS_STORE, and
// editable afterwards via the seller's own Store Profile page.
const storeProfileSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true, index: true },
    storeName: { type: String, required: true, trim: true },
    profileImage: { type: String, trim: true, default: '' },
    bannerImage: { type: String, trim: true, default: '' },

    // Admin-managed collections (see businessType.model.js /
    // storeCategory.model.js) — the frontend fetches the active list and
    // submits IDs, never free-typed values. See auth.service.js /
    // storeProfile.service.js for the exists+active check performed
    // before these are ever written.
    businessType: { type: mongoose.Schema.Types.ObjectId, ref: 'business_types', required: true },
    categoryIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'store_categories', default: [] },

    // Same location shape as materialListing.schema.js's `location`
    // subdoc (city/state/pincode/area + optional geo point) — reused
    // inline rather than through a shared module to avoid touching the
    // existing listing schema.
    location: {
      city: { type: String, trim: true, required: true },
      state: { type: String, trim: true, required: true },
      pincode: { type: String, trim: true, default: '' },
      area: { type: String, trim: true, default: '' },
      geo: { type: geoPointSchema, default: undefined },
    },
    address: { type: String, trim: true, required: true }, // full street address line

    // Structured fields captured from the address-autocomplete
    // suggestion the seller picked (see auth.validation.js's
    // `addressMeta`) — optional, since a provider may not return every
    // field, and never trusted as the sole source for `location` above
    // (city/state there are still the values the seller explicitly
    // selected in the State/City dropdowns).
    addressMeta: {
      formattedAddress: { type: String, trim: true, default: '' },
      postalCode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' },
    },

    categories: { type: [String], default: [] }, // denormalized category names, kept in sync for display — see storeProfile.service.js
    pickupAvailable: { type: Boolean, default: false },
    deliveryAvailable: { type: Boolean, default: false },

    // Format-validated in Joi (storeProfile.validation.js / auth.validation.js),
    // same convention as sellerBankAccount.schema.js's `ifsc` — this only
    // ever stores what was submitted, it does NOT mean PAN/GST have been
    // verified against any government registry (no such integration
    // exists). `verificationStatus` above is the only real verification
    // signal, and it stays UNVERIFIED regardless of these fields.
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    gstRegistered: { type: Boolean, default: false },
    gstin: { type: String, trim: true, uppercase: true, default: '' },

    verificationStatus: { type: String, enum: Object.values(STORE_VERIFICATION_STATES), default: STORE_VERIFICATION_STATES.UNVERIFIED, index: true },
    verificationNote: { type: String, trim: true, default: '' },

    history: [{ action: { type: String, required: true }, note: { type: String, trim: true, default: '' }, at: { type: Date, default: Date.now } }],
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

storeProfileSchema.index({ 'location.geo': '2dsphere' });

module.exports = storeProfileSchema;
