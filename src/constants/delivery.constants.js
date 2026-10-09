const configenv = require('../config/env.config');

// Seller-quoted delivery for one order (transaction.delivery). It runs while
// the order is still PAYMENT_PENDING and never touches escrow — it only
// decides what deliveryCharge the buyer agrees to pay. Changed ONLY through
// service/app/deliveryQuote.service.js, which validates every move against
// DELIVERY_QUOTE_TRANSITIONS and applies it as a compare-and-set.
//
//   (buyer picks DELIVERY) → AWAITING_SELLER → QUOTED → ACCEPTED → pay
//   AWAITING_SELLER / QUOTED → DECLINED (seller can't deliver)
//   QUOTED → REJECTED (buyer) → (buyer re-requests) AWAITING_SELLER
//   AWAITING_SELLER / QUOTED → EXPIRED (order cancelled by the reservation sweep)
//   anything but ACCEPTED → NOT_REQUIRED (buyer switches to pickup)
//
// The seller's quote (delivery.charge) is a proposal: transaction.deliveryCharge
// and totalPayable change only when the buyer ACCEPTS a specific quote version.

const DELIVERY_QUOTE_STATES = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  AWAITING_SELLER: 'AWAITING_SELLER',
  QUOTED: 'QUOTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
});

const D = DELIVERY_QUOTE_STATES;

// action → { from: [...allowed current states], to, actor }
const DELIVERY_QUOTE_TRANSITIONS = Object.freeze({
  // A new request (or a changed address / vehicle) replaces any open quote.
  REQUEST: { from: [D.NOT_REQUIRED, D.AWAITING_SELLER, D.QUOTED, D.REJECTED, D.DECLINED], to: D.AWAITING_SELLER, actor: 'buyer' },
  // QUOTED → QUOTED is the seller revising before the buyer answers.
  QUOTE: { from: [D.AWAITING_SELLER, D.QUOTED], to: D.QUOTED, actor: 'seller' },
  DECLINE: { from: [D.AWAITING_SELLER, D.QUOTED], to: D.DECLINED, actor: 'seller' },
  ACCEPT: { from: [D.QUOTED], to: D.ACCEPTED, actor: 'buyer' },
  REJECT: { from: [D.QUOTED], to: D.REJECTED, actor: 'buyer' },
  SWITCH_TO_PICKUP: { from: [D.NOT_REQUIRED, D.AWAITING_SELLER, D.QUOTED, D.REJECTED, D.DECLINED], to: D.NOT_REQUIRED, actor: 'buyer' },
  EXPIRE: { from: [D.AWAITING_SELLER, D.QUOTED], to: D.EXPIRED, actor: 'system' },
});

// Plain-language labels for buyer and seller UIs (one source).
const DELIVERY_QUOTE_LABELS = Object.freeze({
  NOT_REQUIRED: 'No delivery quote needed',
  AWAITING_SELLER: 'Waiting for the seller to confirm delivery',
  QUOTED: 'Delivery charge ready for your review',
  ACCEPTED: 'Delivery agreed',
  REJECTED: 'Delivery charge rejected',
  DECLINED: 'Seller can\'t deliver this order',
  EXPIRED: 'Delivery request expired',
});

// Units whose weight is the unit itself — used when a listing has no
// weightPerUnitKg. Every other unit needs the seller-entered weight.
const UNIT_WEIGHT_KG = Object.freeze({ kg: 1, ton: 1000 });

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
// How long the seller has to answer a delivery request, and the buyer to
// accept + pay once quoted — both enforced through reservationExpiresAt and
// the existing transaction.service#expireStaleReservations sweep.
const SELLER_QUOTE_SLA_HOURS = num(configenv.DELIVERY_SELLER_QUOTE_SLA_HOURS, 24);
const BUYER_QUOTE_WINDOW_HOURS = num(configenv.DELIVERY_BUYER_QUOTE_WINDOW_HOURS, 24);

// Upper bound on a seller-entered delivery charge (sanity guard, ₹).
const MAX_DELIVERY_CHARGE = num(configenv.DELIVERY_MAX_CHARGE, 500000);

module.exports = {
  DELIVERY_QUOTE_STATES, DELIVERY_QUOTE_TRANSITIONS, DELIVERY_QUOTE_LABELS, UNIT_WEIGHT_KG,
  SELLER_QUOTE_SLA_HOURS, BUYER_QUOTE_WINDOW_HOURS, MAX_DELIVERY_CHARGE,
};
