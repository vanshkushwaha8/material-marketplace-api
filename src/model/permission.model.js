const mongoose = require('mongoose');
const permissionSchema = require('../schema/permission.schema');
const permissionModel = mongoose.model('permissions', permissionSchema);
module.exports = permissionModel;
