const mongoose = require('mongoose');
const payoutModel = require('../../model/payout.model');
const sellerBankAccountModel = require('../../model/sellerBankAccount.model');
const transactionModel = require('../../model/transaction.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYOUT_STATES, BANK_ACCOUNT_STATES, PAYMENT_PROCESSING_FEE_PCT } = require('../../constants/payout.constants');
const { TRANSACTION_STATES, SETTLEMENT_STATES } = require('../../constants/transaction.constants');
const { toPaise, fromPaise } = require('../../helper/money.helper');
const { getPayoutAdapter } = require('../../config/integrations.config');
const configenv = require('../../config/env.config');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class PayoutError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'PayoutError'; this.statusCode = statusCode; }
}

// Called once, right after transaction.service.js#confirmReceipt marks a
// transaction COMPLETED. Re-entrant: safe to call again (e.g. a retry
// job) because every step checks the Payout's current status first, and
// Payout has a unique index on `transaction` so it's never duplicated.
async function evaluateAndInitiatePayout({ transactionId, req }) {
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new PayoutError('Transaction not found', 404);

  let payout = await payoutModel.findOne({ transaction: txn._id });
  if (!payout) {
    const commissionAmount = txn.platformCommissionAmount || 0;
    const processingFeeAmount = fromPaise(Math.round(toPaise(txn.agreedAmount) * (PAYMENT_PROCESSING_FEE_PCT / 100)));
    const netPayoutAmount = fromPaise(toPaise(txn.agreedAmount) - toPaise(commissionAmount) - toPaise(processingFeeAmount));
    payout = await payoutModel.create({
      transaction: txn._id, seller: txn.seller,
      grossAmount: txn.agreedAmount, platformCommissionAmount: commissionAmount,
      paymentProcessingFeeAmount: processingFeeAmount, netPayoutAmount, currency: txn.currency || 'INR',
      status: PAYOUT_STATES.PENDING, history: [{ action: 'CREATED' }],
    });
  }

  if ([PAYOUT_STATES.PROCESSING, PAYOUT_STATES.PAID].includes(payout.status)) return payout; // already in flight/done

  // Blocking-condition check, re-read fresh in case a dispute landed
  // between transaction completion and this call.
  const freshTxn = await transactionModel.findById(txn._id);
  const blocked = freshTxn.disputed || [TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.REFUNDED, TRANSACTION_STATES.DISPUTED].includes(freshTxn.status);
  if (blocked) {
    payout.history.push({ action: 'BLOCKED', note: `Transaction status: ${freshTxn.status}, disputed: ${freshTxn.disputed}` });
    await payout.save();
    return payout;
  }

  payout.status = PAYOUT_STATES.PAYOUT_ELIGIBLE;
  payout.eligibleAt = new Date();
  payout.history.push({ action: 'PAYOUT_ELIGIBLE' });
  await payout.save();
  await createAuditLog({ req, userId: txn.seller, action: auditLogConstants.PAYOUT_ELIGIBLE, entity: 'payouts', entityId: payout._id });

  const bankAccount = await sellerBankAccountModel.findOne({ seller: txn.seller, is_deleted: deleteConstants.NOT_DELETED });
  if (!bankAccount || bankAccount.verificationStatus !== BANK_ACCOUNT_STATES.VERIFIED) {
    payout.history.push({ action: 'PAYOUT_HELD', note: 'Seller bank account not verified' });
    await payout.save();
    return payout; // stays PAYOUT_ELIGIBLE — retryPayout() below picks it up once verified
  }

  return initiateProviderPayout({ payout, bankAccount, req });
}

async function initiateProviderPayout({ payout, bankAccount, req }) {
  payout.sellerBankAccount = bankAccount._id;
  payout.status = PAYOUT_STATES.PROCESSING;
  payout.provider = configenv.PAYOUT_PROVIDER || 'manual';
  payout.history.push({ action: 'PAYOUT_INITIATED' });
  await payout.save();

  try {
    const adapter = getPayoutAdapter();
    const { providerPayoutId, status } = await adapter.createPayout({
      providerFundAccountId: bankAccount.providerFundAccountId,
      amountPaise: toPaise(payout.netPayoutAmount), currency: payout.currency,
      idempotencyKey: String(payout._id), // same payout retried never double-pays at the provider
      notes: { transactionId: String(payout.transaction) },
    });
    payout.providerPayoutId = providerPayoutId;
    payout.providerPayoutStatus = status;
    if (['processed', 'completed'].includes(String(status).toLowerCase())) {
      await markPayoutPaid(payout, req);
    } else {
      await payout.save(); // stays PROCESSING until reconciliation/webhook confirms
    }
  } catch (err) {
    payout.status = PAYOUT_STATES.PAYOUT_FAILED;
    payout.failureReason = err.message;
    payout.history.push({ action: 'PAYOUT_FAILED', note: err.message });
    await payout.save();
    await createAuditLog({ req, userId: payout.seller, action: auditLogConstants.PAYOUT_FAILED, entity: 'payouts', entityId: payout._id });
  }
  return payout;
}

async function markPayoutPaid(payout, req) {
  payout.status = PAYOUT_STATES.PAID;
  payout.processedAt = new Date();
  payout.history.push({ action: 'PAID' });
  await payout.save();
  await transactionModel.updateOne({ _id: payout.transaction }, { $set: { settlementStatus: SETTLEMENT_STATES.RELEASED } });
  await createAuditLog({ req, userId: payout.seller, action: auditLogConstants.PAYOUT_PAID, entity: 'payouts', entityId: payout._id });
}

// Called by the seller after fixing bank details (or a retry job) — picks
// up a payout stuck at PAYOUT_ELIGIBLE or PAYOUT_FAILED.
async function retryPayout({ payoutId, sellerId, req }) {
  if (!mongoose.Types.ObjectId.isValid(payoutId)) throw new PayoutError('Invalid payout id', 404);
  const payout = await payoutModel.findOne({ _id: payoutId, is_deleted: deleteConstants.NOT_DELETED });
  if (!payout) throw new PayoutError('Payout not found', 404);
  if (String(payout.seller) !== String(sellerId)) throw new PayoutError('Not your payout', 403);
  if (![PAYOUT_STATES.PAYOUT_ELIGIBLE, PAYOUT_STATES.PAYOUT_FAILED].includes(payout.status)) {
    throw new PayoutError(`Cannot retry a payout in status ${payout.status}`, 409);
  }
  const bankAccount = await sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!bankAccount || bankAccount.verificationStatus !== BANK_ACCOUNT_STATES.VERIFIED) throw new PayoutError('Bank account is not verified yet', 409);
  return initiateProviderPayout({ payout, bankAccount, req });
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

module.exports = { PayoutError, evaluateAndInitiatePayout, retryPayout, myPayouts };