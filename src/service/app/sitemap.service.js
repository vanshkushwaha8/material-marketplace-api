const materialListingModel = require('../../model/materialListing.model');
const materialCategoryModel = require('../../model/materialCategory.model');
const storeProfileModel = require('../../model/storeProfile.model');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');

// Must produce exactly the same slug as the frontend's utils/slug.js
// (listingPath) — the URL the page itself declares as canonical.
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Public, indexable pages only (mirrors robots.txt / page-level robots meta).
const STATIC_PATHS = ['/', '/materials', '/near-me', '/how-to-buy', '/for-sellers', '/about-us', '/faqs', '/help-center', '/contact-us'];

// Sitemaps are capped at 50,000 URLs; beyond that this needs a sitemap index.
const MAX_LISTING_URLS = 45000;

async function buildSitemapXml(siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const [categories, listings, stores] = await Promise.all([
    materialCategoryModel.find({ status: 'active', is_deleted: deleteConstants.NOT_DELETED, parentCategory: null }).select('slug updatedAt').lean(),
    materialListingModel.find({ status: LISTING_STATES.LIVE, is_deleted: deleteConstants.NOT_DELETED })
      .select('title updatedAt').sort({ updatedAt: -1 }).limit(MAX_LISTING_URLS).lean(),
    storeProfileModel.find({ is_deleted: deleteConstants.NOT_DELETED }).select('seller updatedAt').lean(),
  ]);

  // Only stores whose owner is still an active BUSINESS_STORE seller.
  const activeOwners = new Set((await userModel.find({
    _id: { $in: stores.map((s) => s.seller) },
    sellerType: SELLER_TYPES.BUSINESS_STORE,
    status: { $ne: 'suspended' },
    is_deleted: deleteConstants.NOT_DELETED,
  }).select('_id').lean()).map((u) => String(u._id)));

  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: `${base}${p}` })),
    ...categories.filter((c) => c.slug).map((c) => ({ loc: `${base}/materials/${c.slug}`, lastmod: c.updatedAt })),
    ...listings.map((l) => {
      const slug = slugify(l.title);
      return { loc: `${base}/material/${slug ? `${slug}-` : ''}${l._id}`, lastmod: l.updatedAt };
    }),
    ...stores.filter((s) => activeOwners.has(String(s.seller))).map((s) => ({ loc: `${base}/store/${s.seller}`, lastmod: s.updatedAt })),
  ];

  const body = urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = { buildSitemapXml, slugify };
