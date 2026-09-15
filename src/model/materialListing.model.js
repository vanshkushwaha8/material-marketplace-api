const mongoose = require('mongoose');
const materialListingSchema = require('../schema/materialListing.schema');
const materialListingModel = mongoose.model('material_listings', materialListingSchema);
module.exports = materialListingModel;
