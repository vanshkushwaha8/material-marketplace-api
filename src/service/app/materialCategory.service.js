const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');

function logoUrl(filename) {
  return filename ? `/images/${filename}` : '';
}

// Public, read-only — buyers/sellers browse the taxonomy when
// creating/filtering listings. Management lives in the admin-side service.
// `topLevel` (used by registration / seller Store Profile's "Categories
// You Sell" picker — see storeProfile.service.js#assertStoreCategoriesActive)
// restricts the list to root categories, since that picker has no way to
// display parent/child nesting and previously drew from its own flat
// store_categories collection.
async function list({ topLevel } = {}) {
  const query = { status: 'active', is_deleted: deleteConstants.NOT_DELETED };
  if (topLevel === true || topLevel === 'true') query.parentCategory = null;
  const categories = await materialCategoryModel
    .find(query)
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return categories.map((c) => ({ ...c, logoUrl: logoUrl(c.logo) }));
}

module.exports = { list };