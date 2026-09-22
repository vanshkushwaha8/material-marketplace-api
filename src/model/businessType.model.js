const mongoose = require('mongoose');
const businessTypeSchema = require('../schema/businessType.schema');
const businessTypeModel = mongoose.model('business_types', businessTypeSchema);
module.exports = businessTypeModel;
