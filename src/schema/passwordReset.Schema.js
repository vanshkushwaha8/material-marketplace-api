const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        index: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "admins",
        index: true
    },
    tokenHash: {           
        type: String,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = passwordResetSchema