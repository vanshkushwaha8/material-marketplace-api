// Business/Store seller profile — a separate entity from the User doc,
// keyed 1:1 by seller, following the same "sub-entity keyed by seller"
// shape as sellerBankAccount.schema.js.

const BUSINESS_TYPES = Object.freeze({
  BUILDING_MATERIAL_STORE: 'BUILDING_MATERIAL_STORE',
  HARDWARE_STORE: 'HARDWARE_STORE',
  CEMENT_DEALER: 'CEMENT_DEALER',
  TILE_STORE: 'TILE_STORE',
  ELECTRICAL_STORE: 'ELECTRICAL_STORE',
  PLUMBING_STORE: 'PLUMBING_STORE',
  PAINT_STORE: 'PAINT_STORE',
  GENERAL_CONSTRUCTION_MATERIALS: 'GENERAL_CONSTRUCTION_MATERIALS',
  OTHER: 'OTHER',
});

// Self-declared tags a store sells under — deliberately a fixed list
// rather than the material_categories taxonomy (which governs listing
// creation/spec validation) since these are broader storefront labels,
// not a listing's actual category.
const STORE_CATEGORIES = Object.freeze({
  CEMENT: 'CEMENT',
  TMT_STEEL: 'TMT_STEEL',
  BRICKS_BLOCKS: 'BRICKS_BLOCKS',
  TILES: 'TILES',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  HARDWARE: 'HARDWARE',
  PAINT: 'PAINT',
  PLYWOOD_WOOD: 'PLYWOOD_WOOD',
  SAND_AGGREGATES: 'SAND_AGGREGATES',
  DOORS_WINDOWS: 'DOORS_WINDOWS',
  OTHER: 'OTHER',
});

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

module.exports = { BUSINESS_TYPES, STORE_CATEGORIES, STORE_VERIFICATION_STATES };
