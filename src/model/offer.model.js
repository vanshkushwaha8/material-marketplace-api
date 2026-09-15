const mongoose = require('mongoose');
const offerSchema = require('../schema/offer.schema');
const offerModel = mongoose.model('offers', offerSchema);
module.exports = offerModel;
