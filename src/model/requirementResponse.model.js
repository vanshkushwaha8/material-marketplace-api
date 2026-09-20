const mongoose = require('mongoose');
const requirementResponseSchema = require('../schema/requirementResponse.schema');
const requirementResponseModal = mongoose.model('requirement_responses', requirementResponseSchema);
module.exports = requirementResponseModal;
