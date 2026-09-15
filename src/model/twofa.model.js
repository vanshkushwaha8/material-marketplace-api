const mongoose = require('mongoose');
const twofaSchema = require("../schema/twofa.schema");
const twofaModel = mongoose.model('twofa',twofaSchema);
module.exports = twofaModel;