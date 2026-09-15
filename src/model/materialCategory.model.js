const mongoose = require('mongoose');
const materialCategorySchema = require('../schema/materialCategory.schema');
const materialCategoryModel = mongoose.model('material_categories', materialCategorySchema);
module.exports = materialCategoryModel;
