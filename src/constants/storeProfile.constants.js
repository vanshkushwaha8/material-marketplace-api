// Business/Store seller profile — a separate entity from the User doc,
// keyed 1:1 by seller, following the same "sub-entity keyed by seller"
// shape as sellerBankAccount.schema.js.

// BUSINESS_TYPES/STORE_CATEGORIES used to be fixed enums here. Both are
// now admin-managed collections (business_types / store_categories —
// see businessType.model.js / storeCategory.model.js) referenced from
// storeProfile.schema.js by ObjectId, so new values don't need a deploy.

// Same shape/naming as materialListing's VERIFICATION_STATES and
// sellerBankAccount's BANK_ACCOUNT_STATES — no verification integration
// exists yet, so this only ever reaches UNVERIFIED today. Never set to
// VERIFIED without a real verification step actually being implemented.
const STORE_VERIFICATION_STATES = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

module.exports = { STORE_VERIFICATION_STATES };
