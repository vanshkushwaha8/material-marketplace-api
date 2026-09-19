const mongoose = require('mongoose');
const storeProfileSchema = require('../schema/storeProfile.schema');
const StoreProfile = mongoose.model('store_profiles', storeProfileSchema);
module.exports = StoreProfile;
