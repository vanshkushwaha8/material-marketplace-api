// Construction-materials marketplace — listing lifecycle + trust states.
// Mirrors the old projectState.constants.js shape (LIVE/DRAFT-style state
// machine) so the same "explicit states, centralize transitions, reject
// invalid ones" convention carries over from the removed project domain.

const LISTING_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  SOLD_OUT: 'SOLD_OUT',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
});

// Listings visible in public browse/search — everything else is seller- or
// admin-only.
const BUYER_VISIBLE_STATES = [LISTING_STATES.LIVE, LISTING_STATES.SOLD_OUT, LISTING_STATES.PAUSED, LISTING_STATES.REJECTED, LISTING_STATES.ARCHIVED,];

const VERIFICATION_STATES = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

const CONDITION_TYPES = Object.freeze({
  NEW_SURPLUS: 'new_surplus',
  UNUSED_INVENTORY: 'unused_inventory',
  EXCESS_PROJECT_INVENTORY: 'excess_project_inventory',
  PROJECT_CANCELLATION_INVENTORY: 'project_cancellation_inventory',
  OVER_PURCHASED: 'over_purchased',
  USED: 'used',
});

// Every category MUST map to one of these validators in
// materialSpecs.validation.js — see that file's SPEC_VALIDATORS map.
// Keeping the list here (rather than only in validation) is what lets
// materialCategory.service.js reject an admin from creating a category
// slug with no matching spec schema.
const CATEGORY_SLUGS = Object.freeze({
  CEMENT: 'cement',
  TMT_STEEL: 'tmt-steel',
  ELECTRICAL_WIRE: 'electrical-wire',
  TILES: 'tiles',
  BINDING_WIRE: 'binding-wire',
  BRICKS: 'bricks',
  PIPES: 'pipes',
  PLUMBING: 'plumbing',
  HARDWARE: 'hardware',
  PAINT: 'paint',
  CONSTRUCTION_CHEMICALS: 'construction-chemicals',
  OTHER: 'other',
});

const MAX_LISTING_IMAGES = 12;
const MAX_LISTING_VIDEOS = 2;

module.exports = {
  LISTING_STATES,
  BUYER_VISIBLE_STATES,
  VERIFICATION_STATES,
  CONDITION_TYPES,
  CATEGORY_SLUGS,
  MAX_LISTING_IMAGES,
  MAX_LISTING_VIDEOS,
};
