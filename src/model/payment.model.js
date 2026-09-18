const mongoose = require('mongoose');
const paymentSchema = require('../schema/payment.schema');
const paymentModel = mongoose.model('payments', paymentSchema);
module.exports = paymentModel;