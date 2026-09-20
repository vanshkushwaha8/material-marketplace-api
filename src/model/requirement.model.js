const mongoose = require('mongoose');
const requirementSchema = require('../schema/requirement.schema');
module.exports = mongoose.model('requirements', requirementSchema);