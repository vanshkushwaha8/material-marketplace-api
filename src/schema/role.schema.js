const mongoose = require('mongoose');
const  ADMIN_ONLY_ROLES  = require("../constants/adminRoles.constants");
const roleSchema = new mongoose.Schema(
    {
        permissionIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "permissions"
        }],
        roleName: {
            type: String,
            enum: Object.values(ADMIN_ONLY_ROLES),
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

module.exports = roleSchema;