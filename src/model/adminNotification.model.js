const mongoose = require('mongoose');
const adminNotificationSchema = require('../schema/adminNotification.schema');
const adminNotificationModel = mongoose.model('admin_notifications', adminNotificationSchema);
module.exports = adminNotificationModel;
