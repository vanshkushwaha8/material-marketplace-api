const mongoose = require('mongoose');
const requirementSchema = require('../schema/requirement.schema');
const requirementModal = mongoose.model('requirements', requirementSchema);
module.exports = requirementModal;