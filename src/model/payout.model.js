const mongoose = require('mongoose');
const payoutSchema = require('../schema/payout.schema');
const Payout = mongoose.model('payouts', payoutSchema);
module.exports = Payout;