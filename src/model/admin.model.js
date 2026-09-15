const mongoose = require('mongoose');
const adminSchema = require("../schema/admin.schema");
const adminModel = mongoose.model('admins',adminSchema);
module.exports = adminModel;