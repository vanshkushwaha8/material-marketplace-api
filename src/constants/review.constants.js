const REVIEWER_ROLES = Object.freeze({ BUYER: 'buyer', SELLER: 'seller' });

// Only ACTIVE reviews count toward a seller's public average/count.
//  HIDDEN      — removed by an admin (moderation); restorable.
//  INVALIDATED — the order stopped being eligible after the review was
//                written (e.g. refunded); set by the system, not editable.
const REVIEW_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', HIDDEN: 'HIDDEN', INVALIDATED: 'INVALIDATED' });

module.exports = { REVIEWER_ROLES, REVIEW_STATUS };
