const mongoose = require('mongoose');
const transactionSchema = require('../schema/transaction.schema');
const transactionModel = mongoose.model('transactions', transactionSchema);
module.exports = transactionModel;