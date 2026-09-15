const mongoose = require('mongoose');
const otpSchema = require("../schema/otp.schema");
const otpModel = mongoose.model('otps',otpSchema);
module.exports = otpModel;