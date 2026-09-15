const mongoose = require('mongoose');

/**
 * NOTE: This file was not included in the original set of files shared, so
 * it has been reconstructed here based on how it is consumed in
 * auth.service.js (userId, consentId, type, version, acceptedAt, ipAddress,
 * userAgent). If your actual schema differs, just add the single new
 * "language" field below into your existing schema — everything else here
 * should already match what's in production.
 */
const userConsentHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
            index: true,
        },

        consentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userconsents",
            required: true,
        },

        type: {
            type: String,
            enum: ["TERMS", "COOKIE", "PRIVACY"],
            required: true,
        },

        // Denormalized from the consent record being accepted — lets a
        // query for "all Developer consent history" run directly against
        // this collection without joining back to userconsents for every
        // row. Optional/defaulted rather than required so any pre-existing
        // history rows (created before this field existed) keep working
        // unchanged.
        userType: {
            type: String,
            enum: ["Buyer", "Seller", "all"],
            default: "all",
            index: true,
        },

        version: {
            type: String,
            required: true,
        },

        // NEW: the language that was actually presented to and accepted by
        // the user for this specific consent record. Defaults to "en" so
        // any historical rows without this field keep working.
        language: {
            type: String,
            enum: ["en", "fr"],
            required: true,
            default: "en",
        },

        acceptedAt: {
            type: Date,
            default: Date.now,
        },

        ipAddress: {
            type: String,
        },

        userAgent: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = userConsentHistorySchema;