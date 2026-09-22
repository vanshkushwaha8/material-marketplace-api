// Mirrors MarketplaceRegister.jsx's SELLER_TYPES exactly — keep both in
// sync if either changes. BUSINESS_TYPES/STORE_CATEGORIES used to be
// hardcoded here too; they're now admin-managed collections — see
// business_types / store_categories (businessType.model.js /
// storeCategory.model.js) — instead of a fixed enum.
const SELLER_TYPES = Object.freeze({ INDIVIDUAL: 'INDIVIDUAL', BUSINESS_STORE: 'BUSINESS_STORE' });

module.exports = { SELLER_TYPES };