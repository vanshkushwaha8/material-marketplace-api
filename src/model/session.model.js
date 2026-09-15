const mongoose = require('mongoose');
const sessionSchema = require("../schema/session.schema");
const sessionModel = mongoose.model('sessions',sessionSchema);
module.exports = sessionModel;