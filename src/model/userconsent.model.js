const mongoose = require('mongoose');
const userConsentSchema = require("../schema/userConsent.schema");
const userConsentModel = mongoose.model('userConsents',userConsentSchema);
module.exports = userConsentModel;