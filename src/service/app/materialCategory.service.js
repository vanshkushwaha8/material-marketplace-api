const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');
const cache = require('../../helper/cache.helper');
const materialListingModel = require('../../model/materialListing.model');
const { LISTING_STATES } = require('../../constants/materialListing.constants');

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

// Live-listing stats per category for the buyer landing page (category
// tiles' "N items", "Best Value Materials" lowest price + seller count,
// "Materials Near You" filter chips) — one aggregate instead of a listing
// request per category. Only LIVE listings a buyer can act on; prices are
// the listing's own per-unit price (the unit travels with it). Cached for
// two minutes and not invalidated on every listing change, so a brand-new
// listing can take that long to show up in the counts.
const STATS_TTL_S = 120;

async function listingStats() {
  return cache.getOrSet(cache.NAMESPACES.CATEGORY_STATS, 'live', STATS_TTL_S, async () => {
    const rows = await materialListingModel.aggregate([
      { $match: { status: LISTING_STATES.LIVE, is_deleted: deleteConstants.NOT_DELETED } },
      { $sort: { price: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$category',
          listingCount: { $sum: 1 },
          sellers: { $addToSet: '$seller' },
          minPrice: { $first: '$price' },
          minPriceUnit: { $first: '$unit' },
          // first photo among the category's listings, cheapest first
          images: { $push: { $arrayElemAt: ['$images.url', 0] } },
        },
      },
      {
        $project: {
          listingCount: 1,
          sellerCount: { $size: '$sellers' },
          minPrice: 1,
          minPriceUnit: 1,
          imageUrl: { $arrayElemAt: [{ $filter: { input: '$images', cond: { $ne: ['$$this', null] } } }, 0] },
        },
      },
    ]);
    return rows.map((r) => ({ ...r, _id: String(r._id) }));
  });
}

/**
 * Active categories with their live-listing stats (0 / null when a
 * category has no live listings). Public fields only.
 */
async function summary() {
  const [categories, stats] = await Promise.all([list(), listingStats()]);
  const byId = new Map(stats.map((s) => [s._id, s]));
  return categories.map((c) => {
    const s = byId.get(String(c._id));
    return {
      _id: c._id,
      name: c.name,
      slug: c.slug,
      parentCategory: c.parentCategory || null,
      logoUrl: c.logoUrl,
      listingCount: s?.listingCount || 0,
      sellerCount: s?.sellerCount || 0,
      minPrice: s ? s.minPrice : null,
      minPriceUnit: s ? s.minPriceUnit : null,
      imageUrl: s?.imageUrl || '',
    };
  });
}

module.exports = { list, summary };