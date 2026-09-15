const mongoose = require('mongoose');
const moduleSchema = require('../schema/module.schema');
const moduleModel = mongoose.model('modules', moduleSchema);
module.exports = moduleModel;
