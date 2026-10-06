const mongoose = require('mongoose');
const deliveryRateSettingSchema = require('../schema/deliveryRateSetting.schema');
module.exports = mongoose.model('delivery_rate_settings', deliveryRateSettingSchema);
