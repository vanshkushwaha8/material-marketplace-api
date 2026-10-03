const mongoose = require("mongoose");

// One-time account tokens (collection "passwordresets"): password-reset links
// for users and admins, and staff invitation links. Only the SHA-256 hash of
// the token is stored. A token is usable only while
//   tokenType matches AND expiresAt > now AND usedAt == null AND revokedAt == null
// — see helper/accountToken.helper.js, the only code that reads or writes it.
const TOKEN_TYPES = Object.freeze({
    PASSWORD_RESET: "PASSWORD_RESET",
    STAFF_INVITATION: "STAFF_INVITATION",
});

const passwordResetSchema = new mongoose.Schema({
    // Exactly one of userId (buyers/sellers) / adminId (Super Admin, staff).
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
    // Records from before tokenType existed have none: adminId ones were
    // invitations, userId ones resets (resolved in the helper).
    tokenType: {
        type: String,
        enum: Object.values(TOKEN_TYPES),
    },
    tokenHash: {
        type: String,
        required: true,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    usedAt: {
        type: Date,
        default: null
    },
    revokedAt: {
        type: Date,
        default: null
    },
    // Legacy flag (pre-usedAt). Still honoured as "used" and still set on
    // consume, so old and new code agree during a rolling deploy.
    used: {
        type: Boolean,
        default: false
    },
}, { timestamps: true });

// Housekeeping only — validity never depends on records being deleted. Kept
// a week past expiry so an old link still reports "expired"/"already used"
// instead of "invalid".
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

passwordResetSchema.statics.TOKEN_TYPES = TOKEN_TYPES;

module.exports = passwordResetSchema;
module.exports.TOKEN_TYPES = TOKEN_TYPES;
