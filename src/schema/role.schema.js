const mongoose = require('mongoose');
const { ASSIGNABLE_ADMIN_PERMISSIONS } = require('../constants/rbac.constants');

// A staff role: a name plus permission keys from the code catalog
// (constants/rbac.constants.js). The Super Admin is not a role document.
const roleSchema = new mongoose.Schema(
    {
        roleName: {
            type: String,
            trim: true,
            required: true,
            maxlength: 50,
        },
        description: {
            type: String,
            trim: true,
            default: '',
            maxlength: 200,
        },
        permissions: {
            type: [{ type: String, enum: ASSIGNABLE_ADMIN_PERMISSIONS }],
            default: [],
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
        }
    },
    {
        timestamps: true
    }
);
roleSchema.index({ is_deleted: 1, roleName: 1 });

module.exports = roleSchema;
