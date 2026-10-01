const mongoose = require('mongoose');
const payoutModel = require('../../model/payout.model');
const sellerBankAccountModel = require('../../model/sellerBankAccount.model');
const transactionModel = require('../../model/transaction.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYOUT_STATES, BANK_ACCOUNT_STATES, SELLER_PAYOUT_READINESS, PAYMENT_PROCESSING_FEE_PCT } = require('../../constants/payout.constants');
const userModel = require('../../model/user.model');
const { notifyAdmins } = require('../admin/adminNotification.service');
const { TRANSACTION_STATES, SETTLEMENT_STATES, COMMISSION_STATES } = require('../../constants/transaction.constants');
const { toPaise, fromPaise } = require('../../helper/money.helper');
const { getPayoutAdapter } = require('../../config/integrations.config');
const configenv = require('../../config/env.config');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const escrow = require('./escrow.service');
const { ESCROW_STATES, ESCROW_ACTORS, ESCROW_PENDING_OPERATIONS } = require('../../constants/escrow.constants');

// Provider payout statuses → our outcome. RazorpayX: queued / pending /
// processing / processed / reversed / failed / rejected / cancelled.
const PROVIDER_PAID = ['processed', 'completed'];
const PROVIDER_FAILED = ['failed', 'reversed', 'rejected', 'cancelled'];
class PayoutError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'PayoutError'; this.statusCode = statusCode; }
}

// Called once, right after transaction.service.js#confirmReceipt marks a
// transaction COMPLETED. Re-entrant: safe to call again (e.g. a retry
// job) because every step checks the Payout's current status first, and
// Payout has a unique index on `transaction` so it's never duplicated.
async function evaluateAndInitiatePayout({ transactionId, req }) {
  const txn = await escrow.loadWithEscrow(transactionId);
  if (!txn || txn.is_deleted !== deleteConstants.NOT_DELETED) throw new PayoutError('Transaction not found', 404);

  // Only an escrow that has been released for settlement (buyer confirmed
  // or admin approved, commission deducted) may pay the seller.
  if (txn.escrowStatus !== ESCROW_STATES.RELEASE_PENDING) {
    return payoutModel.findOne({ transaction: txn._id });
  }

  let payout = await payoutModel.findOne({ transaction: txn._id });
  if (!payout) {
    // Snapshot of the amounts locked on the transaction at capture time.
    const commissionAmount = txn.platformCommissionAmount || 0;
    const processingFeeAmount = fromPaise(Math.round(toPaise(txn.agreedAmount) * (PAYMENT_PROCESSING_FEE_PCT / 100)));
    const netPayoutAmount = fromPaise(toPaise(txn.agreedAmount) - toPaise(commissionAmount) - toPaise(processingFeeAmount));
    try {
      payout = await payoutModel.create({
        transaction: txn._id, seller: txn.seller,
        grossAmount: txn.agreedAmount, platformCommissionAmount: commissionAmount,
        paymentProcessingFeeAmount: processingFeeAmount, netPayoutAmount, currency: txn.currency || 'INR',
        status: PAYOUT_STATES.PENDING, history: [{ action: 'CREATED' }],
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // unique {transaction}: a concurrent call created it
      payout = await payoutModel.findOne({ transaction: txn._id });
    }
  }

  if ([PAYOUT_STATES.PROCESSING, PAYOUT_STATES.PAID].includes(payout.status)) return payout; // already in flight/done

  if (payout.status === PAYOUT_STATES.PENDING) {
    payout = await payoutModel.findOneAndUpdate(
      { _id: payout._id, status: PAYOUT_STATES.PENDING },
      { $set: { status: PAYOUT_STATES.PAYOUT_ELIGIBLE, eligibleAt: new Date() }, $push: { history: { action: 'PAYOUT_ELIGIBLE' } } },
      { new: true }
    ) || await payoutModel.findById(payout._id);
    await createAuditLog({ req, userId: txn.seller, action: auditLogConstants.PAYOUT_ELIGIBLE, entity: 'payouts', entityId: payout._id });
  }

  const [bankAccount, sellerUser] = await Promise.all([
    sellerBankAccountModel.findOne({ seller: txn.seller, is_deleted: deleteConstants.NOT_DELETED }),
    userModel.findById(txn.seller).select('status').lean(),
  ]);
  const readiness = resolvePayoutReadiness({ bankAccount, sellerStatus: sellerUser?.status });
  if (readiness !== SELLER_PAYOUT_READINESS.READY) {
    // Waiting on the SELLER (bank details / verification), not a failure:
    // escrow stays RELEASE_PENDING with the reason shown to everyone.
    const why = `Waiting for the seller's payout account (${readiness.replace('PAYOUT_', '').replace(/_/g, ' ').toLowerCase()})`;
    await payoutModel.updateOne({ _id: payout._id }, { $push: { history: { action: 'PAYOUT_HELD', note: why } } });
    await transactionModel.updateOne({ _id: txn._id }, { $set: { escrowAttentionReason: why } });
    await notifyAdmins('PAYOUT_HELD', {
      title: 'Seller payout on hold',
      message: `₹${Number(payout.netPayoutAmount).toLocaleString('en-IN')} is due but the seller's payout status is ${readiness.replace('PAYOUT_', '').replace(/_/g, ' ').toLowerCase()}.`,
      entityType: 'payout', entityId: payout._id, userId: txn.seller,
      dedupeKey: `PAYOUT_HELD:${payout._id}`,
    });
    return payoutModel.findById(payout._id); // retryPayout() picks it up once READY
  }

  return initiateProviderPayout({ payout, bankAccount, req });
}

async function initiateProviderPayout({ payout, bankAccount, req }) {
  // Atomic claim: exactly one caller moves the payout to PROCESSING. A
  // double-clicked retry, a concurrent admin retry or a retried request gets
  // null here and returns without calling the provider.
  const claimed = await payoutModel.findOneAndUpdate(
    { _id: payout._id, status: { $in: [PAYOUT_STATES.PENDING, PAYOUT_STATES.PAYOUT_ELIGIBLE, PAYOUT_STATES.PAYOUT_FAILED] } },
    {
      $set: { status: PAYOUT_STATES.PROCESSING, sellerBankAccount: bankAccount._id, provider: configenv.PAYOUT_PROVIDER || 'manual', failureReason: '' },
      $inc: { attempts: 1 },
      $push: { history: { action: 'PAYOUT_INITIATED' } },
    },
    { new: true }
  );
  if (!claimed) return payoutModel.findById(payout._id);

  try {
    const adapter = getPayoutAdapter();
    const { providerPayoutId, status } = await adapter.createPayout({
      providerFundAccountId: bankAccount.providerFundAccountId,
      amountPaise: toPaise(claimed.netPayoutAmount), currency: claimed.currency,
      idempotencyKey: `${claimed._id}:${claimed.attempts}`,
      notes: { transactionId: String(claimed.transaction), attempt: String(claimed.attempts) },
    });
    await payoutModel.updateOne({ _id: claimed._id }, { $set: { providerPayoutId, providerPayoutStatus: status } });
    const s = String(status || '').toLowerCase();
    if (PROVIDER_PAID.includes(s)) return markPayoutPaid({ payoutId: claimed._id, providerPayoutId, req });
    if (PROVIDER_FAILED.includes(s)) return markPayoutFailed({ payoutId: claimed._id, reason: `Provider reported ${s}`, req });
    return payoutModel.findById(claimed._id); // PROCESSING until payout.processed / payout.failed / refresh
  } catch (err) {
    return markPayoutFailed({ payoutId: claimed._id, reason: err.message, notConfigured: err.statusCode === 503, req });
  }
}

/** Payout failed at the provider → escrow REQUIRES_ADMIN_ACTION (release). Idempotent. */
async function markPayoutFailed({ payoutId, reason, notConfigured = false, req }) {
  const payout = await payoutModel.findOneAndUpdate(
    { _id: payoutId, status: { $in: [PAYOUT_STATES.PROCESSING, PAYOUT_STATES.PAYOUT_ELIGIBLE] } },
    { $set: { status: PAYOUT_STATES.PAYOUT_FAILED, failureReason: String(reason || '').slice(0, 500) }, $push: { history: { action: 'PAYOUT_FAILED', note: reason } } },
    { new: true }
  );
  if (!payout) return payoutModel.findById(payoutId);
  await createAuditLog({ req, userId: payout.seller, action: auditLogConstants.PAYOUT_FAILED, entity: 'payouts', entityId: payout._id, reason });

  await escrow.transition({
    transactionId: payout.transaction, action: 'RELEASE_FAILED', actor: { type: ESCROW_ACTORS.PROVIDER }, reason,
    providerRef: payout.providerPayoutId || '', amount: payout.netPayoutAmount,
    set: { escrowPendingOperation: ESCROW_PENDING_OPERATIONS.RELEASE, escrowAttentionReason: `Payout failed: ${reason}` },
    req,
  }).catch((err) => console.error('[payout] escrow RELEASE_FAILED not applied:', err.message));

  if (notConfigured) {
    await notifyAdmins('PAYOUTS_NOT_CONFIGURED', {
      title: 'Seller payouts are not configured',
      message: 'A payout could not be sent because RazorpayX (PAYOUT_PROVIDER / PAYOUT_ACCOUNT_NUMBER) is not configured on the server. Payouts will keep failing until it is.',
      dedupeKey: `PAYOUTS_NOT_CONFIGURED:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  await notifyAdmins('ESCROW_ACTION_REQUIRED', {
    title: 'Seller payout failed — retry needed',
    message: `₹${Number(payout.netPayoutAmount).toLocaleString('en-IN')} release failed: ${String(reason || '').slice(0, 200)}`,
    entityType: 'transaction', entityId: payout.transaction, userId: payout.seller,
    dedupeKey: `RELEASE_FAILED:${payout._id}:${payout.attempts}`,
  });
  await notificationService.createNotification({
    recipientId: payout.seller, type: NOTIFICATION_TYPES.PAYOUT_FAILED,
    title: 'Payout delayed', message: 'Your payout could not be sent yet. Our team has been alerted and will retry it.', entityType: 'payout', entityId: payout._id,
  });
  return payout;
}

async function markPayoutPaid({ payoutId, providerPayoutId, manual = false, externalReference = '', actor, reason = '', req }) {
  const payout = await payoutModel.findOneAndUpdate(
    { _id: payoutId, status: manual ? { $in: [PAYOUT_STATES.PAYOUT_FAILED, PAYOUT_STATES.PAYOUT_ELIGIBLE, PAYOUT_STATES.PENDING] } : PAYOUT_STATES.PROCESSING },
    {
      $set: {
        status: PAYOUT_STATES.PAID, processedAt: new Date(), resolution: manual ? 'MANUAL' : 'PROVIDER',
        ...(providerPayoutId ? { providerPayoutId } : {}), ...(externalReference ? { externalReference } : {}),
      },
      $push: { history: { action: manual ? 'PAID_MANUALLY' : 'PAID', note: manual ? `${externalReference} — ${reason}` : '' } },
    },
    { new: true }
  );
  if (!payout) return payoutModel.findById(payoutId); // already paid (duplicate webhook / refresh)

  await escrow.transition({
    transactionId: payout.transaction, action: manual ? 'MANUAL_MARK_RELEASED' : 'RELEASE_CONFIRMED',
    actor: actor || { type: ESCROW_ACTORS.PROVIDER }, reason: manual ? `${reason} (ref ${externalReference})` : '',
    providerRef: providerPayoutId || externalReference || '', amount: payout.netPayoutAmount,
    set: {
      settlementStatus: SETTLEMENT_STATES.RELEASED, commissionStatus: COMMISSION_STATES.SETTLED,
      releasedAt: new Date(), escrowPendingOperation: null, escrowAttentionReason: '',
    },
    req,
  });
  await createAuditLog({ req, userId: payout.seller, action: auditLogConstants.PAYOUT_PAID, entity: 'payouts', entityId: payout._id, metadata: { manual, externalReference: externalReference || undefined } });
  await notificationService.createNotification({
    recipientId: payout.seller, type: NOTIFICATION_TYPES.PAYOUT_PAID,
    title: 'Payment released', message: `₹${payout.netPayoutAmount.toLocaleString('en-IN')} (after commission) has been sent to your bank account`, entityType: 'payout', entityId: payout._id,
  });
  const txn = await transactionModel.findById(payout.transaction).select('buyer').lean();
  if (txn) {
    await notificationService.createNotification({
      recipientId: txn.buyer, type: NOTIFICATION_TYPES.PAYMENT_RELEASED,
      title: 'Order settled', message: 'Your payment has been released to the seller. This order is complete.', entityType: 'transaction', entityId: payout.transaction,
    });
  }
  return payout;
}

/** RazorpayX payout.* webhook → paid / failed. Idempotent. */
async function handlePayoutWebhook({ eventType, entity, req }) {
  const payout = await payoutModel.findOne({ providerPayoutId: entity?.id });
  if (!payout) return { ignored: true };
  await payoutModel.updateOne({ _id: payout._id }, { $set: { providerPayoutStatus: entity.status || '' } });
  if (eventType === 'payout.processed') return markPayoutPaid({ payoutId: payout._id, providerPayoutId: entity.id, req });
  if (['payout.failed', 'payout.reversed', 'payout.rejected'].includes(eventType)) {
    return markPayoutFailed({ payoutId: payout._id, reason: entity.failure_reason || entity.status_details?.description || eventType.replace('payout.', 'Payout '), req });
  }
  return payout;
}

/** Ask the provider for a PROCESSING payout's real status (admin refresh). */
async function refreshPayoutStatus({ payoutId, req }) {
  const payout = await payoutModel.findById(payoutId);
  if (!payout) throw new PayoutError('Payout not found', 404);
  if (payout.status !== PAYOUT_STATES.PROCESSING || !payout.providerPayoutId) return payout;
  const { status } = await getPayoutAdapter().fetchPayout(payout.providerPayoutId);
  const s = String(status || '').toLowerCase();
  await payoutModel.updateOne({ _id: payout._id }, { $set: { providerPayoutStatus: s } });
  if (PROVIDER_PAID.includes(s)) return markPayoutPaid({ payoutId: payout._id, providerPayoutId: payout.providerPayoutId, req });
  if (PROVIDER_FAILED.includes(s)) return markPayoutFailed({ payoutId: payout._id, reason: `Provider reported ${s}`, req });
  return payoutModel.findById(payout._id);
}

/** Admin retry of a failed/held release (escrow already back in RELEASE_PENDING). */
async function adminRetryPayout({ transactionId, req }) {
  const payout = await payoutModel.findOne({ transaction: transactionId });
  if (!payout) return evaluateAndInitiatePayout({ transactionId, req });
  if (payout.status === PAYOUT_STATES.PAYOUT_FAILED) {
    await payoutModel.updateOne({ _id: payout._id, status: PAYOUT_STATES.PAYOUT_FAILED }, { $set: { status: PAYOUT_STATES.PAYOUT_ELIGIBLE }, $push: { history: { action: 'ADMIN_RETRY' } } });
  }
  return evaluateAndInitiatePayout({ transactionId, req });
}

// Called by the seller after fixing bank details (or a retry job) — picks
// up a payout stuck at PAYOUT_ELIGIBLE or PAYOUT_FAILED.
async function retryPayout({ payoutId, sellerId, req }) {
  if (!mongoose.Types.ObjectId.isValid(payoutId)) throw new PayoutError('Invalid payout id', 404);
  const payout = await payoutModel.findOne({ _id: payoutId, is_deleted: deleteConstants.NOT_DELETED });
  if (!payout) throw new PayoutError('Payout not found', 404);
  if (String(payout.seller) !== String(sellerId)) throw new PayoutError('Not your payout', 403);
  // Seller may only kick off a payout that was waiting on THEIR bank
  // verification. A provider failure needs an admin retry (REQUIRES_ADMIN_ACTION).
  if (payout.status !== PAYOUT_STATES.PAYOUT_ELIGIBLE) {
    throw new PayoutError(payout.status === PAYOUT_STATES.PAYOUT_FAILED
      ? 'This payout failed at the bank/provider — our team has been notified and will retry it'
      : `Cannot retry a payout in status ${payout.status}`, 409);
  }
  const bankAccount = await sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!bankAccount || bankAccount.verificationStatus !== BANK_ACCOUNT_STATES.VERIFIED) throw new PayoutError('Bank account is not verified yet', 409);
  return evaluateAndInitiatePayout({ transactionId: payout.transaction, req });
}

async function myPayouts({ sellerId, status, page = 1, limit = 20 }) {
  const query = { seller: sellerId, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    payoutModel.find(query)
      .populate({ path: 'transaction', select: 'listing agreedQuantity', populate: { path: 'listing', select: 'title unit' } })
      .sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    payoutModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

// Pure mapping — the single definition of "can this seller be settled".
// A suspended seller is RESTRICTED even with a verified account; a
// provider-DISABLED account is RESTRICTED too (admin/provider action, not
// something the seller can fix by re-entering details).
function resolvePayoutReadiness({ bankAccount, sellerStatus }) {
  if (sellerStatus === 'suspended') return SELLER_PAYOUT_READINESS.RESTRICTED;
  if (!bankAccount) return SELLER_PAYOUT_READINESS.NOT_STARTED;
  switch (bankAccount.verificationStatus) {
    case BANK_ACCOUNT_STATES.VERIFIED: return SELLER_PAYOUT_READINESS.READY;
    case BANK_ACCOUNT_STATES.PENDING: return SELLER_PAYOUT_READINESS.PENDING;
    case BANK_ACCOUNT_STATES.DISABLED: return SELLER_PAYOUT_READINESS.RESTRICTED;
    case BANK_ACCOUNT_STATES.FAILED: return SELLER_PAYOUT_READINESS.FAILED;
    default: return SELLER_PAYOUT_READINESS.NOT_STARTED;
  }
}

// Seller-facing summary (dashboard banner, accept-offer gate, admin user
// detail). Never includes the account number — only the masked last 4.
// `refresh` re-checks an in-flight asynchronous penny drop with the provider.
async function getPayoutReadiness(sellerId, { refresh = false, req } = {}) {
  const [user, initialAccount] = await Promise.all([
    userModel.findById(sellerId).select('status').lean(),
    sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }),
  ]);
  let bankAccount = initialAccount;
  if (refresh && bankAccount?.verificationStatus === BANK_ACCOUNT_STATES.PENDING) {
    const bankAccountService = require('./bankAccount.service');
    bankAccount = await bankAccountService.verifyBankAccount({ sellerId, req }).catch(() => bankAccount);
  }
  const readiness = resolvePayoutReadiness({ bankAccount, sellerStatus: user?.status });
  return {
    readiness,
    canAcceptOffers: readiness === SELLER_PAYOUT_READINESS.READY,
    bankAccount: bankAccount ? {
      bankName: bankAccount.bankName,
      accountHolderName: bankAccount.accountHolderName,
      accountNumberLast4: bankAccount.accountNumberLast4,
      ifsc: bankAccount.ifsc,
      verificationStatus: bankAccount.verificationStatus,
      verifiedAt: bankAccount.verifiedAt,
      failureReason: bankAccount.failureReason || '',
    } : null,
  };
}

module.exports = {
  PayoutError, evaluateAndInitiatePayout, retryPayout, adminRetryPayout, markPayoutPaid, markPayoutFailed,
  handlePayoutWebhook, refreshPayoutStatus, myPayouts, resolvePayoutReadiness, getPayoutReadiness,
};