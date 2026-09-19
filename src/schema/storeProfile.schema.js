const mongoose = require('mongoose');
const { BUSINESS_TYPES, STORE_CATEGORIES, STORE_VERIFICATION_STATES } = require('../constants/storeProfile.constants');
const deleteConstants = require('../constants/delete.constants');

// One per BUSINESS_STORE seller — created at registration
// (auth.service.js#register) when sellerType === BUSINESS_STORE, and
// editable afterwards via the seller's own Store Profile page.
const storeProfileSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true, index: true },
    storeName: { type: String, required: true, trim: true },
    businessType: { type: String, enum: Object.values(BUSINESS_TYPES), required: true },

    // Same location shape as materialListing.schema.js's `location`
    // subdoc (city/state/pincode/area + optional geo point) — reused
    // inline rather than through a shared module to avoid touching the
    // existing listing schema.
    location: {
      city: { type: String, trim: true, required: true },
      state: { type: String, trim: true, required: true },
      pincode: { type: String, trim: true, default: '' },
      area: { type: String, trim: true, default: '' },
      geo: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined },
      },
    },
    address: { type: String, trim: true, required: true }, // full street address line

    categories: { type: [String], enum: Object.values(STORE_CATEGORIES), default: [] },
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
