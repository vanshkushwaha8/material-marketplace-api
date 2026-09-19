// Centralized so "individual vs business/store seller" is checked the
// same way everywhere (registration, listing creation, marketplace
// cards/filters) instead of ad-hoc string comparisons per call site.
const SELLER_TYPES = Object.freeze({
  INDIVIDUAL: 'INDIVIDUAL',
  BUSINESS_STORE: 'BUSINESS_STORE',
});

module.exports = { SELLER_TYPES };
