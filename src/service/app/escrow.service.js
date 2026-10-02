const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const payoutModel = require('../../model/payout.model');
const {
  ESCROW_STATES, ESCROW_TERMINAL_STATES, ESCROW_TRANSITIONS, ESCROW_ACTORS,
} = require('../../constants/escrow.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

// The ONE place that changes a transaction's escrow (money) state.
//
//   currentStatus + action ──validate──▶ allowed? ──atomic CAS──▶ applied
//                                          └─ no ──▶ EscrowTransitionError
//
// The update is a compare-and-set on the exact current state, so two
// concurrent callers (webhook + browser callback, double-clicked admin
// button, retried request) can never both apply the same transition — the
// loser gets { applied: false } (if the state already moved where it
// wanted) or an error. Every applied transition appends an escrowHistory
// row and an audit-log entry.

class EscrowTransitionError extends Error {
  constructor(message, { statusCode = 409, code = 'INVALID_TRANSITION', current = null } = {}) {
    super(message);
    this.name = 'EscrowTransitionError';
    this.statusCode = statusCode;
    this.errorCode = code;
    this.current = current;
  }
}

function canTransition(current, action) {
  const rule = ESCROW_TRANSITIONS[action];
  return Boolean(rule && rule.from.includes(current));
}

/** Allowed actions from a state (used by UIs to show only valid buttons). */
function allowedActions(current) {
  return Object.entries(ESCROW_TRANSITIONS).filter(([, r]) => r.from.includes(current)).map(([a]) => a);
}

// Escrow state for transactions created before escrowStatus existed,
// derived from the order/payout state they already have.
function deriveLegacyEscrowStatus(txn, payout) {
  switch (txn.status) {
    case TRANSACTION_STATES.PAYMENT_PENDING: return ESCROW_STATES.INITIATED;
    case TRANSACTION_STATES.CANCELLED: return ESCROW_STATES.CANCELLED;
    case TRANSACTION_STATES.REFUNDED: return ESCROW_STATES.REFUNDED;
    case TRANSACTION_STATES.DISPUTED: return ESCROW_STATES.DISPUTED;
    case TRANSACTION_STATES.PAYMENT_CONFIRMED:
    case TRANSACTION_STATES.READY_FOR_HANDOVER: return ESCROW_STATES.HELD;
    case TRANSACTION_STATES.HANDOVER_STARTED:
    case TRANSACTION_STATES.BUYER_INSPECTION: return ESCROW_STATES.DELIVERED;
    case TRANSACTION_STATES.BUYER_CONFIRMED:
    case TRANSACTION_STATES.COMPLETED:
      if (payout?.status === PAYOUT_STATES.PAID) return ESCROW_STATES.RELEASED;
      if (payout?.status === PAYOUT_STATES.PAYOUT_FAILED) return ESCROW_STATES.REQUIRES_ADMIN_ACTION;
      return ESCROW_STATES.RELEASE_PENDING;
    default: return ESCROW_STATES.INITIATED;
  }
}

// Reads the RAW document (lean → no schema defaults) so a legacy row with
// no escrowStatus is detected and backfilled once, atomically.
async function loadWithEscrow(transactionId) {
  let raw = await transactionModel.findById(transactionId).lean();
  if (!raw) return null;
  if (!raw.escrowStatus) {
    const payout = await payoutModel.findOne({ transaction: raw._id }).select('status').lean();
    const derived = deriveLegacyEscrowStatus(raw, payout);
    await transactionModel.updateOne(
      { _id: raw._id, escrowStatus: { $exists: false } },
      { $set: { escrowStatus: derived }, $push: { escrowHistory: { from: null, to: derived, action: 'BACKFILL', actorType: ESCROW_ACTORS.SYSTEM, reason: `Derived from order status ${raw.status}` } } }
    );
    raw = await transactionModel.findById(transactionId).lean();
  }
  return raw;
}

/**
 * Apply one escrow transition.
 *
 * @param {object}  p
 * @param {string}  p.transactionId
 * @param {string}  p.action        key of ESCROW_TRANSITIONS
 * @param {object}  p.actor         { type: ESCROW_ACTORS.*, id?: ObjectId }
 * @param {string} [p.reason]
 * @param {string} [p.providerRef]  provider payment/refund/payout id
 * @param {number} [p.amount]
 * @param {string} [p.idempotencyKey]
 * @param {object} [p.set]          extra fields to $set in the same atomic write
 * @param {object} [p.where]        extra conditions (e.g. { status: 'HANDOVER_STARTED' })
 * @param {object} [p.push]         extra $push (e.g. order history entry)
 * @param {object} [p.req]          for the audit log
 * @param {boolean}[p.throwIfApplied] throw instead of returning applied:false
 * @returns {Promise<{ applied: boolean, txn: object, from: string, to: string }>}
 */
async function transition({ transactionId, action, actor, reason = '', providerRef = '', amount = null, idempotencyKey = null, set = {}, where = {}, push = {}, req, throwIfApplied = false }) {
  const rule = ESCROW_TRANSITIONS[action];
  if (!rule) throw new EscrowTransitionError(`Unknown escrow action ${action}`, { statusCode: 500, code: 'UNKNOWN_ACTION' });
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new EscrowTransitionError('Transaction not found', { statusCode: 404, code: 'NOT_FOUND' });

  const current = await loadWithEscrow(transactionId);
  if (!current) throw new EscrowTransitionError('Transaction not found', { statusCode: 404, code: 'NOT_FOUND' });

  // Same idempotency key already applied → return the earlier result.
  if (idempotencyKey && (current.escrowHistory || []).some((e) => e.idempotencyKey === idempotencyKey)) {
    return { applied: false, txn: current, from: current.escrowStatus, to: current.escrowStatus, duplicate: true };
  }

  const from = current.escrowStatus;
  if (!rule.from.includes(from)) {
    // Retried/duplicate request that already got where it wanted.
    if (from === rule.to && !throwIfApplied) return { applied: false, txn: current, from, to: from, duplicate: true };
    const terminal = ESCROW_TERMINAL_STATES.includes(from);
    throw new EscrowTransitionError(
      terminal ? `This payment is already ${from.toLowerCase().replace(/_/g, ' ')} — no further changes are possible`
        : `Cannot ${action.toLowerCase().replace(/_/g, ' ')} while the payment is ${from.toLowerCase().replace(/_/g, ' ')}`,
      { code: from === rule.to ? 'ALREADY_APPLIED' : 'INVALID_TRANSITION', current: from }
    );
  }

  const event = {
    from, to: rule.to, action, actorType: actor?.type || ESCROW_ACTORS.SYSTEM,
    actorId: actor?.id && mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    reason: String(reason || '').slice(0, 1000), providerRef: providerRef || '', amount, idempotencyKey, at: new Date(),
  };
  const update = {
    $set: { ...set, escrowStatus: rule.to },
    $push: { escrowHistory: event, ...push },
    $inc: { __v: 1 },
  };
  const txn = await transactionModel.findOneAndUpdate(
    { _id: current._id, escrowStatus: from, ...where },
    update,
    { new: true }
  ).lean();

  if (!txn) {
    // Lost a race (or `where` didn't match). Re-read and classify.
    const now = await transactionModel.findById(current._id).lean();
    if (now && now.escrowStatus === rule.to && !throwIfApplied) return { applied: false, txn: now, from: now.escrowStatus, to: now.escrowStatus, duplicate: true };
    throw new EscrowTransitionError('This payment was just updated by another request — refresh to see its current status', { code: 'CONCURRENT_UPDATE', current: now?.escrowStatus });
  }

  const audit = {
    req, action: actor?.type === ESCROW_ACTORS.ADMIN ? auditLogConstants.ADMIN_ESCROW_ACTION : auditLogConstants.ESCROW_TRANSITION,
    entity: 'transactions', entityId: txn._id, fromState: from, toState: rule.to, reason: event.reason,
    metadata: { action, providerRef: event.providerRef || undefined, amount, idempotencyKey: idempotencyKey || undefined },
  };
  if (actor?.type === ESCROW_ACTORS.ADMIN) await createAuditLogAdmin({ ...audit, adminId: actor.id });
  else await createAuditLog({ ...audit, userId: actor?.id || txn.buyer });

  return { applied: true, txn, from, to: rule.to };
}

module.exports = { EscrowTransitionError, transition, canTransition, allowedActions, deriveLegacyEscrowStatus, loadWithEscrow };
