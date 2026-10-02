require('../../model/admin.model'); // registers `admins` for the populate() of admin refs below
const { ADMIN_PERMISSIONS } = require('../../constants/rbac.constants');
const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const paymentModel = require('../../model/payment.model');
const payoutModel = require('../../model/payout.model');
const commissionSettingModel = require('../../model/commissionSetting.model');
const { TRANSACTION_STATES, SETTLEMENT_STATES } = require('../../constants/transaction.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const {
  ESCROW_STATES, ESCROW_ACTORS, ESCROW_LABELS, ESCROW_PENDING_OPERATIONS,
} = require('../../constants/escrow.constants');
const escrow = require('../app/escrow.service');
const refundService = require('../app/refund.service');
const payoutService = require('../app/payout.service');

class AdminEscrowError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'AdminEscrowError'; this.statusCode = statusCode; }
}

// Admin recovery actions. Every one:
//   - validates the current escrow state (state machine),
//   - performs the REAL provider operation where one exists (refund API,
//     payout API) and only marks success once the provider confirms,
//   - is idempotent (Idempotency-Key stored on the escrow ledger row; the
//     state machine rejects a second release/refund regardless),
//   - is recorded with admin id, previous/new state, amount, reason, time.
const ADMIN_ACTIONS = Object.freeze({
  OPEN_REVIEW: 'OPEN_REVIEW',           // take a transaction into ADMIN_REVIEW (dispute / stuck)
  APPROVE_RELEASE: 'APPROVE_RELEASE',   // pay the seller: commission → release → payout
  REFUND: 'REFUND',                     // full refund to the buyer via the provider
  RETRY_REFUND: 'RETRY_REFUND',         // REFUND_FAILED → new provider refund attempt
  RETRY_RELEASE: 'RETRY_RELEASE',       // REQUIRES_ADMIN_ACTION (release) → new payout attempt
  REFRESH_STATUS: 'REFRESH_STATUS',     // ask the provider for the refund/payout's real status
  MANUAL_RELEASE: 'MANUAL_RELEASE',     // seller paid out-of-band (external reference required)
  MANUAL_REFUND: 'MANUAL_REFUND',       // buyer refunded out-of-band (external reference required)
});

const MANUAL_ACTIONS = [ADMIN_ACTIONS.MANUAL_RELEASE, ADMIN_ACTIONS.MANUAL_REFUND];

// Permission(s) each action needs (checked by the controller before
// performAction runs). `all` = every key, `any` = at least one.
const { PAYMENT_RELEASE, PAYMENT_REFUND, PAYMENT_MANUAL_RESOLVE } = ADMIN_PERMISSIONS;
const ACTION_PERMISSIONS = Object.freeze({
  [ADMIN_ACTIONS.OPEN_REVIEW]: { any: [PAYMENT_RELEASE, PAYMENT_REFUND] },
  [ADMIN_ACTIONS.REFRESH_STATUS]: { any: [PAYMENT_RELEASE, PAYMENT_REFUND] },
  [ADMIN_ACTIONS.APPROVE_RELEASE]: { all: [PAYMENT_RELEASE] },
  [ADMIN_ACTIONS.RETRY_RELEASE]: { all: [PAYMENT_RELEASE] },
  [ADMIN_ACTIONS.REFUND]: { all: [PAYMENT_REFUND] },
  [ADMIN_ACTIONS.RETRY_REFUND]: { all: [PAYMENT_REFUND] },
  [ADMIN_ACTIONS.MANUAL_RELEASE]: { all: [PAYMENT_RELEASE, PAYMENT_MANUAL_RESOLVE] },
  [ADMIN_ACTIONS.MANUAL_REFUND]: { all: [PAYMENT_REFUND, PAYMENT_MANUAL_RESOLVE] },
});

/** Which admin actions make sense for a transaction right now (drives the UI buttons). */
function availableActions(txn, payout) {
  const s = txn.escrowStatus;
  const out = [];
  if ([ESCROW_STATES.DISPUTED, ESCROW_STATES.PAID, ESCROW_STATES.HELD, ESCROW_STATES.DELIVERED, ESCROW_STATES.REQUIRES_ADMIN_ACTION].includes(s)) out.push(ADMIN_ACTIONS.OPEN_REVIEW);
  if ([ESCROW_STATES.ADMIN_REVIEW, ESCROW_STATES.DISPUTED].includes(s)) out.push(ADMIN_ACTIONS.APPROVE_RELEASE);
  if ([ESCROW_STATES.PAID, ESCROW_STATES.HELD, ESCROW_STATES.ADMIN_REVIEW, ESCROW_STATES.DISPUTED].includes(s)) out.push(ADMIN_ACTIONS.REFUND);
  if (s === ESCROW_STATES.REFUND_FAILED) out.push(ADMIN_ACTIONS.RETRY_REFUND, ADMIN_ACTIONS.MANUAL_REFUND);
  if (s === ESCROW_STATES.REQUIRES_ADMIN_ACTION && txn.escrowPendingOperation !== ESCROW_PENDING_OPERATIONS.REFUND) out.push(ADMIN_ACTIONS.RETRY_RELEASE, ADMIN_ACTIONS.MANUAL_RELEASE);
  if (s === ESCROW_STATES.REQUIRES_ADMIN_ACTION && txn.escrowPendingOperation === ESCROW_PENDING_OPERATIONS.REFUND) out.push(ADMIN_ACTIONS.RETRY_REFUND);
  if (s === ESCROW_STATES.RELEASE_PENDING) out.push(ADMIN_ACTIONS.RETRY_RELEASE);
  if ((s === ESCROW_STATES.REFUND_PENDING && txn.refund?.providerRefundId) || (payout && payout.status === PAYOUT_STATES.PROCESSING)) out.push(ADMIN_ACTIONS.REFRESH_STATUS);
  return [...new Set(out)];
}

/** Full admin view of one transaction's money flow. */
async function getDetail(transactionId) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new AdminEscrowError('Transaction not found', 404);
  const raw = await escrow.loadWithEscrow(transactionId);
  if (!raw) throw new AdminEscrowError('Transaction not found', 404);
  const txn = await transactionModel.findById(raw._id)
    .populate('listing', 'title unit images')
    .populate('buyer', 'fullName email phoneNumber')
    .populate('seller', 'fullName email phoneNumber sellerType storeName')
    .populate('refund.requestedByAdmin', 'fullName email')
    .lean();
  const [payments, payout, commissionSetting] = await Promise.all([
    paymentModel.find({ transaction: txn._id }).sort({ createdAt: -1 }).lean(),
    payoutModel.findOne({ transaction: txn._id }).populate('sellerBankAccount', 'bankName accountNumberLast4 ifsc').lean(),
    txn.commissionSetting ? commissionSettingModel.findById(txn.commissionSetting).populate('changedBy', 'fullName').lean() : null,
  ]);
  return {
    ...txn,
    escrowLabel: ESCROW_LABELS[txn.escrowStatus] || txn.escrowStatus,
    payments: payments.map((p) => ({ ...p, history: p.history })),
    payment: payments.find((p) => ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status)) || payments[0] || null,
    payout,
    commission: {
      pct: txn.platformCommissionPct, amount: txn.platformCommissionAmount, sellerSettlementAmount: txn.sellerSettlementAmount,
      sellerType: txn.commissionSellerType, lockedAt: txn.commissionLockedAt, deductedAt: txn.commissionDeductedAt,
      setting: commissionSetting ? { _id: commissionSetting._id, pct: commissionSetting.pct, createdAt: commissionSetting.createdAt, changedBy: commissionSetting.changedBy } : null,
    },
    availableActions: availableActions(txn, payout),
  };
}

/**
 * Run one admin recovery action.
 * @param {{ transactionId, action, reason, externalReference?, idempotencyKey?, adminId, canManual?, req }} p
 */
async function performAction({ transactionId, action, reason, externalReference = '', idempotencyKey = null, adminId, canManual = false, req }) {
  if (!Object.values(ADMIN_ACTIONS).includes(action)) throw new AdminEscrowError('Unknown action');
  if (MANUAL_ACTIONS.includes(action)) {
    if (!canManual) throw new AdminEscrowError('You do not have permission for manual payment resolution', 403);
    if (!externalReference || String(externalReference).trim().length < 4) throw new AdminEscrowError('An external reference (bank UTR / provider reference) is required for a manual resolution');
  }
  const actor = { type: ESCROW_ACTORS.ADMIN, id: adminId };
  const txn = await escrow.loadWithEscrow(transactionId);
  if (!txn) throw new AdminEscrowError('Transaction not found', 404);

  // Same key already applied → report the current state, do nothing.
  if (idempotencyKey && (txn.escrowHistory || []).some((e) => e.idempotencyKey === idempotencyKey)) {
    return { duplicate: true, transaction: await getDetail(transactionId) };
  }

  const toReview = async () => {
    const t = await escrow.loadWithEscrow(transactionId);
    if (t.escrowStatus === ESCROW_STATES.ADMIN_REVIEW) return;
    await escrow.transition({ transactionId, action: 'START_ADMIN_REVIEW', actor, reason, req });
  };

  switch (action) {
    case ADMIN_ACTIONS.OPEN_REVIEW:
      await escrow.transition({ transactionId, action: 'START_ADMIN_REVIEW', actor, reason, idempotencyKey, req, throwIfApplied: true });
      break;

    case ADMIN_ACTIONS.APPROVE_RELEASE: {
      await toReview();
      const now = new Date();
      await escrow.transition({
        transactionId, action: 'ADMIN_APPROVE_RELEASE', actor, reason, idempotencyKey, req,
        amount: txn.platformCommissionAmount,
        set: {
          status: TRANSACTION_STATES.COMPLETED, completedAt: txn.completedAt || now, disputed: false,
          settlementStatus: SETTLEMENT_STATES.PENDING, commissionDeductedAt: now,
        },
        push: { history: { action: 'DISPUTE_RESOLVED', by: 'admin', note: `RELEASE — ${reason || ''}` } },
      });
      await escrow.transition({
        transactionId, action: 'QUEUE_RELEASE', actor, reason, req,
        amount: txn.sellerSettlementAmount, set: { releaseRequestedAt: now },
      });
      await payoutService.evaluateAndInitiatePayout({ transactionId, req });
      break;
    }

    case ADMIN_ACTIONS.REFUND: {
      if (txn.escrowStatus === ESCROW_STATES.DISPUTED) await toReview();
      await refundService.requestRefund({ transactionId, actor, reason, idempotencyKey, req });
      break;
    }

    case ADMIN_ACTIONS.RETRY_REFUND:
      await refundService.requestRefund({ transactionId, actor, reason, idempotencyKey, req });
      break;

    case ADMIN_ACTIONS.RETRY_RELEASE:
      if (txn.escrowStatus === ESCROW_STATES.REQUIRES_ADMIN_ACTION) {
        await escrow.transition({
          transactionId, action: 'ADMIN_RETRY_RELEASE', actor, reason, idempotencyKey, req,
          set: { escrowPendingOperation: null, escrowAttentionReason: '' },
        });
      } else if (txn.escrowStatus !== ESCROW_STATES.RELEASE_PENDING) {
        throw new AdminEscrowError(`Cannot retry a release while the payment is ${ESCROW_LABELS[txn.escrowStatus] || txn.escrowStatus}`, 409);
      }
      await payoutService.adminRetryPayout({ transactionId, req });
      break;

    case ADMIN_ACTIONS.REFRESH_STATUS: {
      const payout = await payoutModel.findOne({ transaction: transactionId }).select('_id status').lean();
      if (payout && payout.status === PAYOUT_STATES.PROCESSING) await payoutService.refreshPayoutStatus({ payoutId: payout._id, req });
      if (txn.escrowStatus === ESCROW_STATES.REFUND_PENDING) await refundService.refreshRefundStatus({ transactionId, req });
      break;
    }

    case ADMIN_ACTIONS.MANUAL_RELEASE: {
      if (txn.escrowStatus !== ESCROW_STATES.REQUIRES_ADMIN_ACTION) throw new AdminEscrowError('Manual release is only possible when the release needs admin action', 409);
      const payout = await payoutModel.findOne({ transaction: transactionId });
      if (!payout) throw new AdminEscrowError('No payout record exists for this transaction', 409);
      if (payout.status === PAYOUT_STATES.PROCESSING) throw new AdminEscrowError('A provider payout is still processing — refresh its status first', 409);
      await payoutService.markPayoutPaid({ payoutId: payout._id, manual: true, externalReference: String(externalReference).trim(), actor, reason, req });
      break;
    }

    case ADMIN_ACTIONS.MANUAL_REFUND:
      if (txn.escrowStatus !== ESCROW_STATES.REFUND_FAILED) throw new AdminEscrowError('Manual refund is only possible after a failed refund', 409);
      await refundService.completeRefund({ transactionId, providerRefundId: `manual:${String(externalReference).trim()}`, actor, manual: true, reason, req });
      break;

    default:
      throw new AdminEscrowError('Unknown action');
  }
  return { duplicate: false, transaction: await getDetail(transactionId) };
}

/** Transactions needing an operator, oldest first. */
async function attentionQueue({ page = 1, limit = 20 }) {
  const query = { escrowStatus: { $in: [ESCROW_STATES.DISPUTED, ESCROW_STATES.ADMIN_REVIEW, ESCROW_STATES.REQUIRES_ADMIN_ACTION, ESCROW_STATES.REFUND_FAILED] } };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    transactionModel.find(query).select('listing buyer seller agreedAmount escrowStatus escrowPendingOperation escrowAttentionReason updatedAt')
      .populate('listing', 'title').populate('buyer', 'fullName').populate('seller', 'fullName').sort({ updatedAt: 1 })
      .skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    transactionModel.countDocuments(query),
  ]);
  return { getData: getData.map((t) => ({ ...t, escrowLabel: ESCROW_LABELS[t.escrowStatus] })), count, page: pageNum, limit: pageLimit };
}

module.exports = { AdminEscrowError, ADMIN_ACTIONS, ACTION_PERMISSIONS, availableActions, getDetail, performAction, attentionQueue };
