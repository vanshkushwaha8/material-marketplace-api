const mongoose = require('mongoose');
const permissionSchema = new mongoose.Schema(
    {
         moduleId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "modules"
            },
        modulePermission: {
            type: String
        },
        moduleDisplayPermission: {
            type: String
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

module.exports = permissionSchema;