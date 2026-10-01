const mongoose = require('mongoose');
const commissionSettingSchema = require('../schema/commissionSetting.schema');
module.exports = mongoose.model('commission_settings', commissionSettingSchema);
