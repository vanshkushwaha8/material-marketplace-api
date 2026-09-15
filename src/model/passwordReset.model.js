const mongoose = require('mongoose');
const passwordResetSchema = require("../schema/passwordReset.Schema");
const passwordModel = mongoose.model('passwordResets', passwordResetSchema);
module.exports = passwordModel;
