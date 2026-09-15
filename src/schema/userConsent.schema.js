const mongoose = require('mongoose');
const userConsentSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["TERMS", "COOKIE", "PRIVACY"],
            required: true,
            default: "TERMS",
        },
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
        content: {
            en: {
                type: String,
                required: true,
            },
            fr: {
                type: String,
                required: true,
            },
        },
        startDate: {
            type: Date,
            required: true,
        },

        endDate: {
            type: Date,
            default: null,
        },

        is_deleted: {
            type: String,
            enum: ["0", "1"],
            default: "0",
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
    },
    { timestamps: true }
);
userConsentSchema.index(
    { type: 1, userType: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "active", is_deleted: "0" } }
);
module.exports = userConsentSchema;