const mongoose = require('mongoose');
const requirementResponseSchema = require('../schema/requirementResponse.schema');
module.exports = mongoose.model('requirement_responses', requirementResponseSchema);