const mongoose = require('mongoose');
const sellerFollowSchema = require('../schema/sellerFollow.schema');
module.exports = mongoose.model('seller_follows', sellerFollowSchema);
