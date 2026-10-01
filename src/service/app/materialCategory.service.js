const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');
const cache = require('../../helper/cache.helper');

const CATEGORIES_TTL_S = 60 * 60;

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
//
// Cached (shared): requested on nearly every buyer page, changes only via
// the admin category screens, which invalidate the namespace.
async function list({ topLevel } = {}) {
  const onlyTop = topLevel === true || topLevel === 'true';
  return cache.getOrSet(cache.NAMESPACES.CATEGORIES, onlyTop ? 'top' : 'all', CATEGORIES_TTL_S, async () => {
    const query = { status: 'active', is_deleted: deleteConstants.NOT_DELETED };
    if (onlyTop) query.parentCategory = null;
    const categories = await materialCategoryModel
      .find(query)
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return categories.map((c) => ({ ...c, logoUrl: logoUrl(c.logo) }));
  });
}

module.exports = { list };