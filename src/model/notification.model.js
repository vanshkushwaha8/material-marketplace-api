const mongoose = require('mongoose');
const notificationSchema = require('../schema/notification.schema');
module.exports = mongoose.model('notifications', notificationSchema);