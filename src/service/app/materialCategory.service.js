const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');

// Same URL shape as materialListing.service.js's storeMediaUrl /
// admin/materialCategory.service.js's mediaUrl — kept local here since
// this is the public read path and shouldn't reach into the admin service.
function logoUrl(filename) {
  return filename ? `/images/${filename}` : '';
}

// Public, read-only — buyers/sellers browse the taxonomy when
// creating/filtering listings. Management lives in the admin-side service.
async function list() {
  const categories = await materialCategoryModel
    .find({ status: 'active', is_deleted: deleteConstants.NOT_DELETED })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return categories.map((c) => ({ ...c, logoUrl: logoUrl(c.logo) }));
}

module.exports = { list };