const mongoose = require('mongoose');
const deliveryLocationSchema = require('../schema/deliveryLocation.schema');
const deliveryLocationModel = mongoose.model('delivery_locations', deliveryLocationSchema);
module.exports = deliveryLocationModel;
