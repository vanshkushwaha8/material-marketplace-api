const mongoose = require('mongoose');
const knowledgeTestAttemptSchema = require('../schema/knowledgeTestAttempt.schema');
const knowledgeTestAttemptModel = mongoose.model('knowledgeTestAttempts', knowledgeTestAttemptSchema);
module.exports = knowledgeTestAttemptModel;
