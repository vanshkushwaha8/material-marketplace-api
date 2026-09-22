const mongoose = require('mongoose');
const storeCategorySchema = require('../schema/storeCategory.schema');
const storeCategoryModel = mongoose.model('store_categories', storeCategorySchema);
module.exports = storeCategoryModel;
