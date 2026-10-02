// Escrow (money-holding) lifecycle of a transaction — the backend's single,
// authoritative financial state. It sits next to transaction.status (the
// order/fulfilment state the UI already used) and is ONLY ever changed
// through service/app/escrow.service.js#transition, which validates the
// move against ESCROW_TRANSITIONS below and applies it atomically.
//
//   INITIATED → PROCESSING → PAID → HELD → DELIVERED → BUYER_CONFIRMED
//     → COMMISSION_DEDUCTED → RELEASE_PENDING → RELEASED
//
//   PROCESSING → FAILED → (buyer retries) PROCESSING
//   INITIATED / PROCESSING / FAILED → CANCELLED        (unpaid order closed)
//   PAID / HELD / DELIVERED → DISPUTED → ADMIN_REVIEW
//   ADMIN_REVIEW → COMMISSION_DEDUCTED → RELEASE_PENDING → RELEASED
//   PAID / HELD / ADMIN_REVIEW → REFUND_PENDING → REFUNDED
//   REFUND_PENDING → REFUND_FAILED → (admin retry) REFUND_PENDING
//   RELEASE_PENDING → REQUIRES_ADMIN_ACTION → (admin retry) RELEASE_PENDING
//
// Provider statuses (Razorpay "captured", "processed", RazorpayX payout
// "reversed", …) are mapped onto these actions by the services — they never
// drive business logic directly.

const ESCROW_STATES = Object.freeze({
  INITIATED: 'INITIATED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  HELD: 'HELD',
  DELIVERED: 'DELIVERED',
  BUYER_CONFIRMED: 'BUYER_CONFIRMED',
  COMMISSION_DEDUCTED: 'COMMISSION_DEDUCTED',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
  ADMIN_REVIEW: 'ADMIN_REVIEW',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
  REQUIRES_ADMIN_ACTION: 'REQUIRES_ADMIN_ACTION',
});

const S = ESCROW_STATES;

// Terminal: no action may move a transaction out of these. A second
// "release" or "refund" therefore fails validation instead of running twice.
const ESCROW_TERMINAL_STATES = Object.freeze([S.RELEASED, S.REFUNDED, S.CANCELLED]);

// action → { from: [...allowed current states], to }
const ESCROW_TRANSITIONS = Object.freeze({
  START_PAYMENT:         { from: [S.INITIATED, S.FAILED], to: S.PROCESSING },
  PAYMENT_FAILED:        { from: [S.PROCESSING], to: S.FAILED },
  // A capture can arrive (webhook) before/after our own PROCESSING mark,
  // or after a failed attempt inside the same provider order.
  PAYMENT_CAPTURED:      { from: [S.INITIATED, S.PROCESSING, S.FAILED], to: S.PAID },
  HOLD:                  { from: [S.PAID], to: S.HELD },
  CANCEL_UNPAID:         { from: [S.INITIATED, S.PROCESSING, S.FAILED], to: S.CANCELLED },

  MARK_DELIVERED:        { from: [S.HELD], to: S.DELIVERED },
  BUYER_CONFIRM:         { from: [S.DELIVERED], to: S.BUYER_CONFIRMED },
  DEDUCT_COMMISSION:     { from: [S.BUYER_CONFIRMED], to: S.COMMISSION_DEDUCTED },
  QUEUE_RELEASE:         { from: [S.COMMISSION_DEDUCTED], to: S.RELEASE_PENDING },
  RELEASE_CONFIRMED:     { from: [S.RELEASE_PENDING], to: S.RELEASED },
  RELEASE_FAILED:        { from: [S.RELEASE_PENDING], to: S.REQUIRES_ADMIN_ACTION },
  ADMIN_RETRY_RELEASE:   { from: [S.REQUIRES_ADMIN_ACTION], to: S.RELEASE_PENDING },

  RAISE_DISPUTE:         { from: [S.PAID, S.HELD, S.DELIVERED], to: S.DISPUTED },
  START_ADMIN_REVIEW:    { from: [S.DISPUTED, S.REQUIRES_ADMIN_ACTION, S.PAID, S.HELD, S.DELIVERED], to: S.ADMIN_REVIEW },
  // Admin decided the seller should be paid: commission is deducted then
  // the release is queued, exactly like the normal buyer-confirmed path.
  ADMIN_APPROVE_RELEASE: { from: [S.ADMIN_REVIEW], to: S.COMMISSION_DEDUCTED },

  REQUEST_REFUND:        { from: [S.PAID, S.HELD, S.ADMIN_REVIEW, S.REFUND_FAILED, S.REQUIRES_ADMIN_ACTION], to: S.REFUND_PENDING },
  REFUND_CONFIRMED:      { from: [S.REFUND_PENDING], to: S.REFUNDED },
  REFUND_FAILED:         { from: [S.REFUND_PENDING], to: S.REFUND_FAILED },

  // Authorized manual resolution (money moved outside the provider flow,
  // e.g. a bank transfer) — admin-only, requires an external reference.
  MANUAL_MARK_RELEASED:  { from: [S.REQUIRES_ADMIN_ACTION], to: S.RELEASED },
  MANUAL_MARK_REFUNDED:  { from: [S.REFUND_FAILED], to: S.REFUNDED },
});

const ESCROW_ACTORS = Object.freeze({ BUYER: 'buyer', SELLER: 'seller', ADMIN: 'admin', SYSTEM: 'system', PROVIDER: 'provider' });

// Which money operation a REQUIRES_ADMIN_ACTION / failure is about.
const ESCROW_PENDING_OPERATIONS = Object.freeze({ RELEASE: 'RELEASE', REFUND: 'REFUND' });

// Plain-language labels used by buyer / seller / admin UIs (one source).
const ESCROW_LABELS = Object.freeze({
  INITIATED: 'Awaiting payment',
  PROCESSING: 'Payment processing',
  PAID: 'Paid',
  HELD: 'Payment held (protected)',
  DELIVERED: 'Delivered — awaiting buyer confirmation',
  BUYER_CONFIRMED: 'Buyer confirmed receipt',
  COMMISSION_DEDUCTED: 'Commission deducted',
  RELEASE_PENDING: 'Release to seller pending',
  RELEASED: 'Released to seller',
  FAILED: 'Payment failed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed — payment on hold',
  ADMIN_REVIEW: 'Under admin review',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
  REFUND_FAILED: 'Refund failed — admin action needed',
  REQUIRES_ADMIN_ACTION: 'Needs admin action',
});

module.exports = {
  ESCROW_STATES, ESCROW_TERMINAL_STATES, ESCROW_TRANSITIONS, ESCROW_ACTORS, ESCROW_PENDING_OPERATIONS, ESCROW_LABELS,
};
