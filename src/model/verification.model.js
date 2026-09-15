const mongoose = require('mongoose');
const verificationSchema = require("../schema/verification.schema");
const verificationModel = mongoose.model('verifications',verificationSchema);
module.exports = verificationModel;