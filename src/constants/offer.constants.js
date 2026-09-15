// Offer/negotiation state machine (spec section 18). PENDING is the only
// entry state; every other state is terminal except COUNTERED, which can
// only be answered by the other party (accept the counter, counter again,
// or reject/cancel).
const OFFER_STATES = Object.freeze({
  PENDING: 'PENDING',
  COUNTERED: 'COUNTERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

const OFFER_TERMINAL_STATES = [
  OFFER_STATES.ACCEPTED,
  OFFER_STATES.REJECTED,
  OFFER_STATES.EXPIRED,
  OFFER_STATES.CANCELLED,
];

const DEFAULT_OFFER_EXPIRY_HOURS = 72;

module.exports = { OFFER_STATES, OFFER_TERMINAL_STATES, DEFAULT_OFFER_EXPIRY_HOURS };
