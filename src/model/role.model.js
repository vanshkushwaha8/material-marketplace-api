const mongoose = require('mongoose');
const roleSchema = require('../schema/role.schema');
const roleModel = mongoose.model('roles', roleSchema);
module.exports = roleModel;
