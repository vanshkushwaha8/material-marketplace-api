const configenv = require('../config/env.config');

const BANK_ACCOUNT_STATES = Object.freeze({ PENDING: 'PENDING', VERIFIED: 'VERIFIED', FAILED: 'FAILED', DISABLED: 'DISABLED' });
const PAYOUT_STATES = Object.freeze({ PENDING: 'PENDING', PAYOUT_ELIGIBLE: 'PAYOUT_ELIGIBLE', PROCESSING: 'PROCESSING', PAID: 'PAID', PAYOUT_FAILED: 'PAYOUT_FAILED' });
const PAYOUT_TERMINAL_STATES = [PAYOUT_STATES.PAID];

// Seller-level onboarding state (distinct from a single Payout's state
// above). Derived — never stored — from the provider-verified bank
// account plus the seller's account status; see
// payout.service.js#resolvePayoutReadiness.
const SELLER_PAYOUT_READINESS = Object.freeze({
  NOT_STARTED: 'PAYOUT_NOT_STARTED',
  PENDING: 'PAYOUT_PENDING',
  READY: 'PAYOUT_READY',
  RESTRICTED: 'PAYOUT_RESTRICTED',
  FAILED: 'PAYOUT_FAILED',
});

// Gateway's own processing cut — kept separate from MARKETPLACE_COMMISSION_PCT
// (the platform's own fee) so both appear as distinct line items in the
// seller payout breakdown, per the todo's example.
const PAYMENT_PROCESSING_FEE_PCT = Number(configenv.PAYMENT_PROCESSING_FEE_PCT) || 0;

module.exports = { BANK_ACCOUNT_STATES, PAYOUT_STATES, PAYOUT_TERMINAL_STATES, SELLER_PAYOUT_READINESS, PAYMENT_PROCESSING_FEE_PCT };