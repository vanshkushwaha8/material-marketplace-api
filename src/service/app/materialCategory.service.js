const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');

// Public, read-only — buyers/sellers browse the taxonomy when
// creating/filtering listings. Management lives in the admin-side service.
async function list() {
  return materialCategoryModel
    .find({ status: 'active', is_deleted: deleteConstants.NOT_DELETED })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
}

module.exports = { list };
