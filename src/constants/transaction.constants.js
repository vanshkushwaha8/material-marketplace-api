const configenv = require('../config/env.config');

const TRANSACTION_STATES = Object.freeze({
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  READY_FOR_HANDOVER: 'READY_FOR_HANDOVER',
  HANDOVER_STARTED: 'HANDOVER_STARTED',
  BUYER_INSPECTION: 'BUYER_INSPECTION',
  BUYER_CONFIRMED: 'BUYER_CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
});

const TRANSACTION_TERMINAL_STATES = [
  TRANSACTION_STATES.COMPLETED,
  TRANSACTION_STATES.CANCELLED,
  TRANSACTION_STATES.REFUNDED,
];

const SETTLEMENT_STATES = Object.freeze({
  PENDING: 'PENDING',
  ON_HOLD: 'ON_HOLD',
  RELEASED: 'RELEASED',
});

// Traceable commission lifecycle (spec section "COMMISSION LEDGER") —
// only the states this codebase's transitions can actually reach:
// snapshotted-but-unpaid, collected on payment, settled once the seller's
// payout for that transaction is PAID, or reversed if the payment is
// later fully refunded.
const COMMISSION_STATES = Object.freeze({
  PENDING: 'PENDING',
  COLLECTED: 'COLLECTED',
  SETTLED: 'SETTLED',
  REFUNDED: 'REFUNDED',
});

// Mirrors offer.constants.js' DEFAULT_OFFER_EXPIRY_HOURS convention —
// how long inventory stays reserved for an accepted offer before the
// reservation is released back to available stock.
const RESERVATION_EXPIRY_HOURS = Number(configenv.RESERVATION_EXPIRY_HOURS) || 48;

module.exports = { TRANSACTION_STATES, TRANSACTION_TERMINAL_STATES, SETTLEMENT_STATES, COMMISSION_STATES, RESERVATION_EXPIRY_HOURS };