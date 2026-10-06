const transactionModel = require('../../model/transaction.model');
const paymentModel = require('../../model/payment.model');
const payoutModel = require('../../model/payout.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYMENT_STATES } = require('../../constants/payment.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const { TRANSACTION_STATES, COMMISSION_STATES, SETTLEMENT_STATES } = require('../../constants/transaction.constants');
const { ESCROW_STATES, ESCROW_ACTORS, ESCROW_PENDING_OPERATIONS } = require('../../constants/escrow.constants');
const { toPaise, payableAmount } = require('../../helper/money.helper');
const { getPaymentAdapter, getManualTestPaymentAdapter } = require('../../config/integrations.config');
const escrow = require('./escrow.service');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { notifyAdmins } = require('../admin/adminNotification.service');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class RefundError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'RefundError'; this.statusCode = statusCode; }
}

// Full refund of a transaction's captured payment, driven by the escrow
// state machine:
//
//   PAID / HELD / ADMIN_REVIEW / REFUND_FAILED ──REQUEST_REFUND──▶ REFUND_PENDING
//        (atomic claim: a second click / concurrent admin cannot start another)
//   provider refund API
//        ├─ processed now ─────────────▶ REFUNDED
//        ├─ pending → refund.processed ▶ REFUNDED   (webhook)
//        └─ error / refund.failed ─────▶ REFUND_FAILED → admin retry
//
// Nothing is marked REFUNDED until the provider confirms it.

async function capturedPaymentFor(transactionId) {
  return paymentModel.findOne({
    transaction: transactionId,
    status: { $in: [PAYMENT_STATES.SUCCESS, PAYMENT_STATES.PARTIALLY_REFUNDED] },
    is_deleted: deleteConstants.NOT_DELETED,
  }).sort({ createdAt: -1 });
}

const adapterFor = (payment) => (payment.provider === 'manual' ? getManualTestPaymentAdapter() : getPaymentAdapter());

/**
 * Start (or retry) a full refund.
 * @param {{ transactionId, actor: { type, id }, reason, idempotencyKey?, req? }} p
 */
async function requestRefund({ transactionId, actor, reason, idempotencyKey = null, req }) {
  const txn = await escrow.loadWithEscrow(transactionId);
  if (!txn) throw new RefundError('Transaction not found', 404);

  // Money already on its way to / with the seller cannot be pulled back by
  // a buyer refund — that needs offline recovery (REQUIRES_ADMIN_ACTION).
  const payout = await payoutModel.findOne({ transaction: txn._id }).select('status').lean();
  if (payout && [PAYOUT_STATES.PROCESSING, PAYOUT_STATES.PAID].includes(payout.status)) {
    throw new RefundError(`The seller payout is already ${payout.status.toLowerCase()} — a buyer refund is not possible from here`, 409);
  }
  const payment = await capturedPaymentFor(txn._id);
  if (!payment) throw new RefundError('No captured payment was found for this transaction', 409);

  const attempt = (txn.refund?.attempts || 0) + 1;
  const claim = await escrow.transition({
    transactionId: txn._id, action: 'REQUEST_REFUND', actor, reason, idempotencyKey,
    amount: payableAmount(txn), providerRef: payment.providerPaymentId || '',
    set: {
      // Full captured amount (product price + buyer fee) — the provider
      // refund below is payment.amountPaise, i.e. the same total.
      'refund.status': 'PENDING', 'refund.amount': payableAmount(txn), 'refund.reason': reason || '',
      'refund.requestedAt': new Date(), 'refund.failureReason': '', 'refund.attempts': attempt,
      'refund.requestedByAdmin': actor?.type === ESCROW_ACTORS.ADMIN ? actor.id : null,
      escrowPendingOperation: ESCROW_PENDING_OPERATIONS.REFUND, escrowAttentionReason: '',
      settlementStatus: SETTLEMENT_STATES.ON_HOLD, disputed: false,
    },
    req,
  });
  if (!claim.applied) return claim.txn; // duplicate request — refund already requested

  const audit = { req, action: auditLogConstants.REFUND_REQUESTED, entity: 'transactions', entityId: txn._id, reason, metadata: { attempt, amount: payableAmount(txn) } };
  if (actor?.type === ESCROW_ACTORS.ADMIN) await createAuditLogAdmin({ ...audit, adminId: actor.id });
  else await createAuditLog({ ...audit, userId: actor?.id || txn.buyer });

  let providerResult;
  try {
    providerResult = await adapterFor(payment).initiateRefund({
      providerPaymentId: payment.providerPaymentId,
      amountPaise: payment.amountPaise,
      // Unique per attempt: the provider de-duplicates a retried request
      // for the same attempt, while a deliberate admin retry is a new one.
      receipt: `rf_${String(txn._id)}_${attempt}`,
      notes: { transactionId: String(txn._id), attempt: String(attempt), reason: String(reason || '').slice(0, 200) },
    });
  } catch (err) {
    await failRefund({ transactionId: txn._id, reason: err.message || 'Provider refund request failed', req });
    throw new RefundError(`Refund could not be started at the payment provider: ${err.message || 'unknown error'}. It is marked for admin retry.`, 502);
  }

  await transactionModel.updateOne({ _id: txn._id }, { $set: { 'refund.providerRefundId': providerResult.providerRefundId || '' } });
  payment.refunds.push({ providerRefundId: providerResult.providerRefundId, amountPaise: payment.amountPaise, status: providerResult.status || 'pending', initiatedByAdminId: actor?.type === ESCROW_ACTORS.ADMIN ? actor.id : null });
  payment.history.push({ action: 'REFUND_REQUESTED', note: `attempt ${attempt}` });
  await payment.save();

  if (String(providerResult.status).toLowerCase() === 'processed') {
    return completeRefund({ transactionId: txn._id, providerRefundId: providerResult.providerRefundId, amountPaise: payment.amountPaise, req });
  }
  return transactionModel.findById(txn._id).lean(); // REFUND_PENDING until refund.processed arrives
}

/** Provider confirmed the refund (sync response or refund.processed webhook). Idempotent. */
async function completeRefund({ transactionId, providerRefundId, amountPaise, actor = { type: ESCROW_ACTORS.PROVIDER }, manual = false, reason = '', req }) {
  const now = new Date();
  const result = await escrow.transition({
    transactionId, action: manual ? 'MANUAL_MARK_REFUNDED' : 'REFUND_CONFIRMED', actor,
    providerRef: providerRefundId || '', reason,
    set: {
      status: TRANSACTION_STATES.REFUNDED, 'refund.status': 'PROCESSED', 'refund.completedAt': now,
      ...(providerRefundId ? { 'refund.providerRefundId': providerRefundId } : {}),
      commissionStatus: COMMISSION_STATES.REFUNDED, escrowPendingOperation: null, escrowAttentionReason: '',
      disputed: false,
    },
    push: { history: { action: 'REFUNDED', by: manual ? 'admin' : 'system', note: manual ? `Manual refund: ${reason}` : '' } },
    req,
  });
  const txn = result.txn;
  if (!result.applied) return txn;

  await paymentModel.updateOne(
    { transaction: txn._id, status: { $in: [PAYMENT_STATES.SUCCESS, PAYMENT_STATES.PARTIALLY_REFUNDED] } },
    { $set: { status: PAYMENT_STATES.REFUNDED, 'refunds.$[r].status': 'processed' }, $push: { history: { action: manual ? 'REFUNDED_MANUALLY' : 'REFUND_PROCESSED' } } },
    { arrayFilters: [{ 'r.providerRefundId': providerRefundId || '__none__' }] }
  );
  await createAuditLog({ req, userId: txn.buyer, action: auditLogConstants.REFUND_COMPLETED, entity: 'transactions', entityId: txn._id, metadata: { providerRefundId, amountPaise, manual } });
  await require('./review.service').invalidateForTransaction(txn._id, 'Order refunded')
    .catch((err) => console.error('Review invalidation failed (non-fatal):', err.message));

  const amount = `₹${Number(payableAmount(txn)).toLocaleString('en-IN')}`;
  await notificationService.createNotification({
    recipientId: txn.buyer, type: NOTIFICATION_TYPES.REFUND_PROCESSED,
    title: 'Refund completed', message: `${amount} has been refunded to your original payment method`,
    entityType: 'transaction', entityId: txn._id,
  });
  await notificationService.createNotification({
    recipientId: txn.seller, type: NOTIFICATION_TYPES.REFUND_PROCESSED,
    title: 'Order refunded', message: `The ${amount} payment for this order was refunded to the buyer`,
    entityType: 'transaction', entityId: txn._id,
  });
  await notifyAdmins('REFUND_PROCESSED', {
    title: 'Refund completed', message: `${amount} refunded to the buyer${providerRefundId ? ` (${providerRefundId})` : ''}.`,
    entityType: 'transaction', entityId: txn._id, userId: txn.buyer,
  });
  return txn;
}

/** Provider rejected the refund (API error or refund.failed webhook). Idempotent. */
async function failRefund({ transactionId, reason, providerRefundId = '', req }) {
  const result = await escrow.transition({
    transactionId, action: 'REFUND_FAILED', actor: { type: ESCROW_ACTORS.PROVIDER }, reason, providerRef: providerRefundId,
    set: {
      'refund.status': 'FAILED', 'refund.failureReason': String(reason || '').slice(0, 500),
      escrowPendingOperation: ESCROW_PENDING_OPERATIONS.REFUND, escrowAttentionReason: `Refund failed: ${reason}`,
    },
    req,
  });
  if (!result.applied) return result.txn;
  await createAuditLog({ req, userId: result.txn.buyer, action: auditLogConstants.REFUND_FAILED, entity: 'transactions', entityId: result.txn._id, reason });
  await notifyAdmins('REFUND_FAILED', {
    title: 'Refund failed — admin action needed',
    message: `₹${Number(payableAmount(result.txn)).toLocaleString('en-IN')} refund failed: ${String(reason || '').slice(0, 200)}. Retry it from the transaction.`,
    entityType: 'transaction', entityId: result.txn._id, userId: result.txn.buyer,
    dedupeKey: `REFUND_FAILED:${result.txn._id}:${result.txn.refund?.attempts || 0}`,
  });
  return result.txn;
}

/** Ask the provider for the refund's current state (admin "refresh"). */
async function refreshRefundStatus({ transactionId, req }) {
  const txn = await escrow.loadWithEscrow(transactionId);
  if (!txn?.refund?.providerRefundId) throw new RefundError('No provider refund to check', 409);
  const payment = await capturedPaymentFor(txn._id) || await paymentModel.findOne({ transaction: txn._id, status: PAYMENT_STATES.REFUNDED });
  const adapter = payment ? adapterFor(payment) : getPaymentAdapter();
  if (typeof adapter.fetchRefund !== 'function') throw new RefundError('This payment provider cannot be queried for refund status', 409);
  const r = await adapter.fetchRefund({ providerPaymentId: payment?.providerPaymentId, providerRefundId: txn.refund.providerRefundId });
  const status = String(r.status || '').toLowerCase();
  if (status === 'processed' && txn.escrowStatus === ESCROW_STATES.REFUND_PENDING) {
    return completeRefund({ transactionId: txn._id, providerRefundId: txn.refund.providerRefundId, amountPaise: r.amountPaise, req });
  }
  if (status === 'failed' && txn.escrowStatus === ESCROW_STATES.REFUND_PENDING) {
    return failRefund({ transactionId: txn._id, reason: 'Provider reports the refund as failed', providerRefundId: txn.refund.providerRefundId, req });
  }
  return transactionModel.findById(txn._id).lean();
}

module.exports = { RefundError, requestRefund, completeRefund, failRefund, refreshRefundStatus, capturedPaymentFor };
