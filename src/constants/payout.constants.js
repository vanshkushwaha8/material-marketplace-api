const configenv = require('../config/env.config');

const BANK_ACCOUNT_STATES = Object.freeze({ PENDING: 'PENDING', VERIFIED: 'VERIFIED', FAILED: 'FAILED', DISABLED: 'DISABLED' });
const PAYOUT_STATES = Object.freeze({ PENDING: 'PENDING', PAYOUT_ELIGIBLE: 'PAYOUT_ELIGIBLE', PROCESSING: 'PROCESSING', PAID: 'PAID', PAYOUT_FAILED: 'PAYOUT_FAILED' });
const PAYOUT_TERMINAL_STATES = [PAYOUT_STATES.PAID];

// Gateway's own processing cut — kept separate from MARKETPLACE_COMMISSION_PCT
// (the platform's own fee) so both appear as distinct line items in the
// seller payout breakdown, per the todo's example.
const PAYMENT_PROCESSING_FEE_PCT = Number(configenv.PAYMENT_PROCESSING_FEE_PCT) || 0;

module.exports = { BANK_ACCOUNT_STATES, PAYOUT_STATES, PAYOUT_TERMINAL_STATES, PAYMENT_PROCESSING_FEE_PCT };