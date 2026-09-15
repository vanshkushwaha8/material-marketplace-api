const mongoose = require('mongoose');
const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users"
        },
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "admins"
        },
        token: {
            type: String
        },
        ipAddress: {
            type: String
        },
        expireOn: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
    },
    { timestamps: true }
);
sessionSchema.index({ expireOn: 1 }, { expireAfterSeconds: 0 });
module.exports = sessionSchema;