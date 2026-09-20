const mongoose = require('mongoose');
const reviewSchema = require('../schema/review.schema');
module.exports = mongoose.model('reviews', reviewSchema);