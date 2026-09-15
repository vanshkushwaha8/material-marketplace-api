const mongoose = require('mongoose');
const moduleSchema = new mongoose.Schema(
    {
        moduleName: {
            type: String
        },
        moduleDisplayName: {
            type: String
        },
        route: {
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

module.exports = moduleSchema;