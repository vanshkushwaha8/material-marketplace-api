const mongoose = require('mongoose');
const userConsentHistory = require("../schema/userConsentHistory.schema");
const userConsentHistoryModel = mongoose.model('userConsentHistory',userConsentHistory);
module.exports = userConsentHistoryModel;