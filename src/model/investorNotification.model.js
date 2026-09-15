const mongoose = require('mongoose');
const investorNotificationSchema = require('../schema/investorNotification.schema');
const investorNotificationModel = mongoose.model('investorNotifications', investorNotificationSchema);
module.exports = investorNotificationModel;
