const mongoose = require('mongoose');
const { SELLER_TYPES } = require('../constants/sellerType.constants');

// Same sub-schema shape as materialListing.schema.js's / storeProfile.schema.js's
// geoPointSchema — see storeProfile.schema.js for why `default: undefined`
// on the field (not on a nested `coordinates` leaf) matters: it's what
// actually stops mongoose auto-instantiating an invalid `{type:'Point'}`
// with no coordinates when no location was captured.
const geoPointSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    { _id: false }
);

const userSchema = new mongoose.Schema({
    userType: {
        type: String,
        enum: ["Buyer", "Seller","ComplianceOfficer"],
        index: true
    },
    // Buyer-only self-declared profile detail — shown on the buyer account
    // summary ("Homeowner", "Builder", etc.) so a seller/admin knows the
    // kind of buyer they're dealing with. Not used for any authorization.
    buyerType: {
        type: String,
        enum: ["Homeowner", "Individual", "Builder", "Contractor", "Business"],
        default: null,
    },
    // Seller-only. Deliberately a field of its own — NOT folded into
    // `buyerType` or a single "userType-subtype" string — so it stays
    // orthogonal to `supplyType` on material_listings (see
    // materialListing.constants.js). Existing sellers without this set
    // are backfilled to INDIVIDUAL by scripts/backfillSellerType.js; the
    // dashboard/listing-creation code must treat a missing value the same
    // as INDIVIDUAL rather than crashing.
    sellerType: {
        type: String,
        enum: Object.values(SELLER_TYPES),
        default: null,
    },
    // Buyer AND Seller registration both collect this (marketplace is
    // location-driven — see materialListing.schema.js's own `location`
    // shape, mirrored here). `geo` is left unset unless real coordinates
    // are supplied — see geoPointSchema above for why that has to be a
    // real sub-schema with `default: undefined` on the field itself
    // rather than a plain nested object (the previous inline shape here
    // auto-instantiated an invalid `{type:'Point'}` with no coordinates
    // on every save with no location captured; harmless on this
    // collection only because it has no 2dsphere index, but it silently
    // discarded the latitude/longitude a buyer/seller actually captured
    // via "Use Current Location" since `latitude`/`longitude` were never
    // schema fields — `geo` below is the field that's actually saved).
    // Buyer AND Seller both send this — buyers need it for delivery
    // matching, sellers for the storefront address.
    location: {
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      area: { type: String, trim: true, default: '' },
      geo: { type: geoPointSchema, default: undefined },
    },
    // BUSINESS_STORE only — undefined/ignored for INDIVIDUAL sellers and
    // Buyers. Kept here purely as a denormalized display name (used by
    // review.service.js / requirement.service.js / materialListing.service.js
    // populates) — businessType/categories/PAN/GST/pickup/delivery are
    // NOT duplicated here anymore; storeProfile.schema.js (referenced by
    // `seller`) is their single source of truth.
    storeName: { type: String, trim: true, default: undefined },
    profilePicture: {
        type: String,
    },
    fullName: {
        type: String,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    gender: {
        type: String,
        enum: ["M", "F", "O"]
    },
    dob: {
        type: Date,
    },
    password: {
        type: String,
    },
    preferredCurrency: {
        type: String,
        uppercase: true,
        enum: [
            "USD",
            "EUR",
            "AUD",
            "INR",  
        ],
        default: "EUR"
    },
    countryOfResidence: {
        type: String,
    },
    mfaEnabled: {
        type: Boolean,
        default: false
    },
    countryCode: {
        type: String
    },
    phoneNumber: {
        type: String,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
   
    // Buyer's saved/shortlisted material listings (was wishlistProjectIds
    // against the removed `projects` collection). Same shape reused for
    // the new marketplace domain.
    savedListingIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'material_listings',
        default: []
    },
    
    
    fcmTokens: [{ type: String }],
    
    status: {
        type: String,
        enum: ["pending", "approved", "rejected","suspended"],
        default: "approved",
        index: true
    },
    termsCondtions: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userconsents",
    },
    cookiesPolicy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userconsents",
    },
    privacyPolicy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userconsents",
    },
    consentLanguage: {
        type: String,
        enum: ["en", "fr"],
        default: "en"
    },
    wallet: {
        amount: {
            type: Number,
            default: 0,
        },
        withdrawAmount: {
            type: Number,
            default: 0,
        },
        currency: {
            type: String,
            enum: [
                "USD",
                "EUR",
                "AUD",
                "INR",
            ],
            default: "EUR"
        },
    },
    inactivityDate: {
        type: Date
    },
    is_deleted: {
        type: String,
        enum: ["0", "1"],
        default: "0",
        index: true,
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },
    lastFailedLoginAt: {
        type: Date,
        default: null,
    },
   
}, {
    timestamps: true
});
userSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: {
            is_deleted: "0",
        },
    }
);
userSchema.index({ 'location.geo': '2dsphere' });
userSchema.pre("validate", function (next) {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }
    next();
});
module.exports = userSchema;