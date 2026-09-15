const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
        },
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "admins",
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        used: {
            type: Boolean,
            default: false,
        },
        usedAt: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
    },
    { timestamps: true }
);

module.exports = verificationSchema;