const mongoose = require('mongoose');
const { ADMIN_ONLY_ROLES } = require("../constants/adminRoles.constants");
const adminSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            default: 'subadmin',
        },
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "roles"
        },
        profilePicture: {
            type: String,
            default: 'twitter.png'
        },
        fullName: {
            type: String
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true
        },
        password: {
            type: String
        },
        isSuperAdmin: {
            type: Boolean,
            default: false
        },
        invitation: {
            type: String,
            default: "sent"
        },
        inactivityDate: {
            type: Date
        },
        isPasswordSet: {
            type: Boolean,
            default: false
        },
        mfaEnabled: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        },
        is_deleted: {
            type: String,
            enum: ['0', '1'],
            default: '0'
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
    },
    {
        timestamps: true
    }
);
adminSchema.index({
    unique: true,
    partialFilterExpression: {
        is_deleted: "0",
    },
});
adminSchema.pre("validate", function (next) {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }
    next();
});
module.exports = adminSchema;