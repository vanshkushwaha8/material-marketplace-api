const mongoose = require('mongoose');
const { SELLER_TYPES } = require('../constants/sellerType.constants');
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
    // are supplied, same reasoning as materialListing.schema.js: an
    // auto-instantiated `{type:'Point'}` with no coordinates would break
    // the 2dsphere index.
        // Buyer AND Seller both send this — buyers need it for delivery
    // matching, sellers for the storefront address.
    location: {
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      area: { type: String, trim: true, default: '' },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    // BUSINESS_STORE only — undefined/ignored for INDIVIDUAL sellers and Buyers.
    storeName: { type: String, trim: true, default: undefined },
    businessType: { type: String, default: undefined },
    storeAddress: { type: String, trim: true, default: undefined },
    categories: [{ type: String }],
    pickupAvailable: { type: Boolean, default: undefined },
    deliveryAvailable: { type: Boolean, default: undefined },
    panNumber: { type: String, uppercase: true, trim: true, default: undefined },
    gstRegistered: { type: Boolean, default: undefined },
    gstin: { type: String, uppercase: true, trim: true, default: undefined },
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
userSchema.pre("validate", function (next) {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }
    next();
});
module.exports = userSchema;