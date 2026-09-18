const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { TRANSACTION_STATES, TRANSACTION_TERMINAL_STATES, SETTLEMENT_STATES } = require('../../constants/transaction.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const configenv = require('../../config/env.config');
const { toPaise, fromPaise, calculateCommissionPaise } = require('../../helper/money.helper');
const payoutService = require('./payout.service');
class TransactionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TransactionError';
    this.statusCode = statusCode;
  }
}

function roleOf(txn, userId) {
  if (String(txn.buyer) === String(userId)) return 'buyer';
  if (String(txn.seller) === String(userId)) return 'seller';
  return null;
}

async function getOwned(transactionId, userId) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new TransactionError('Invalid transaction id', 404);
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new TransactionError('Transaction not found', 404);
  const role = roleOf(txn, userId);
  if (!role) throw new TransactionError('You are not a party to this transaction', 403);
  return { txn, role };
}

// Centralized so 8.9% (or whatever it's changed to) is never hard-coded
// at more than one call site — spec section "8.9% PLATFORM COMMISSION".
function calculateCommission(amount) {
  const pct = Number(configenv.MARKETPLACE_COMMISSION_PCT);
  const { commissionAmountPaise, sellerSettlementPaise } = calculateCommissionPaise(toPaise(amount), pct);
  return { pct, commission: fromPaise(commissionAmountPaise), settlement: fromPaise(sellerSettlementPaise) };
}

// Called ONLY from payment.service.js — after the provider has verified
// the payment (checkout callback or webhook), never directly by the
// buyer. Reserved -> Sold happens here, per the spec's numeric example
// under CORE INVENTORY MODEL. Idempotent: re-checks status before acting,
// since payment.service.js may call this from both the callback and a
// racing webhook for the same payment.
async function markPaymentConfirmed({ transactionId, req }) {
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new TransactionError('Transaction not found', 404);
  if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
    return txn; // already confirmed by the other racing path — no-op
  }

  await materialListingModel.updateOne(
    { _id: txn.listing },
    { $inc: { reservedQuantity: -txn.agreedQuantity, soldQuantity: txn.agreedQuantity } }
  );
  await createAuditLog({ req, userId: txn.buyer, action: auditLogConstants.INVENTORY_SOLD, entity: 'material_listings', entityId: txn.listing, metadata: { transactionId: txn._id, quantity: txn.agreedQuantity } });

  txn.status = TRANSACTION_STATES.PAYMENT_CONFIRMED;
  txn.paymentConfirmedAt = new Date();
  txn.history.push({ action: 'PAYMENT_CONFIRMED', by: 'system' });
  await txn.save();
  await createAuditLog({ req, userId: txn.buyer, action: auditLogConstants.PAYMENT_CONFIRMED, entity: 'transactions', entityId: txn._id });
  return txn;
}

async function markHandover({ transactionId, userId, req }) {
  const { txn, role } = await getOwned(transactionId, userId);
  if (role !== 'seller') throw new TransactionError('Only the seller can start handover', 403);
  if (txn.status !== TRANSACTION_STATES.PAYMENT_CONFIRMED) {
    throw new TransactionError(`Cannot start handover from status ${txn.status}`, 409);
  }
  txn.status = TRANSACTION_STATES.HANDOVER_STARTED;
  txn.handoverStartedAt = new Date();
  txn.history.push({ action: 'HANDOVER_STARTED', by: 'seller' });
  await txn.save();
  await createAuditLog({ req, userId, action: auditLogConstants.HANDOVER_STARTED, entity: 'transactions', entityId: txn._id });
  return txn;
}

async function confirmReceipt({ transactionId, userId, req }) {
  const { txn, role } = await getOwned(transactionId, userId);
  if (role !== 'buyer') throw new TransactionError('Only the buyer can confirm receipt', 403);
  if (txn.status !== TRANSACTION_STATES.HANDOVER_STARTED) {
    throw new TransactionError(`Cannot confirm receipt from status ${txn.status}`, 409);
  }
  const { pct, commission, settlement } = calculateCommission(txn.agreedAmount);
  txn.buyerConfirmedAt = new Date();
  txn.completedAt = new Date();
  txn.status = TRANSACTION_STATES.COMPLETED;
  txn.platformCommissionPct = pct;
    txn.platformCommissionAmount = commission;
  txn.sellerSettlementAmount = settlement;
  // Not RELEASED yet — release now waits on payout eligibility and an
  // actual successful payout (payout.service.js#markPayoutPaid sets this).
  txn.settlementStatus = SETTLEMENT_STATES.PENDING;
  txn.history.push({ action: 'BUYER_CONFIRMED', by: 'buyer' }, { action: 'COMPLETED', by: 'system' });
  await txn.save();
  await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_COMPLETED, entity: 'transactions', entityId: txn._id, metadata: { commission, settlement } });

  await payoutService.evaluateAndInitiatePayout({ transactionId: txn._id, req });
  return txn;
}

async function raiseDispute({ transactionId, userId, reason, req }) {
  const { txn, role } = await getOwned(transactionId, userId);
  if (TRANSACTION_TERMINAL_STATES.includes(txn.status)) {
    throw new TransactionError(`This transaction is already ${txn.status.toLowerCase()}`, 409);
  }
  txn.disputed = true;
  txn.disputeReason = reason;
  txn.status = TRANSACTION_STATES.DISPUTED;
  txn.settlementStatus = SETTLEMENT_STATES.ON_HOLD;
  txn.history.push({ action: 'DISPUTED', by: role, note: reason });
  await txn.save();
  await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_DISPUTED, entity: 'transactions', entityId: txn._id });
  return txn;
}

async function getOne({ transactionId, userId }) {
  const { txn } = await getOwned(transactionId, userId);
  await txn.populate('listing', 'title images unit');
  return txn;
}

async function myTransactions({ userId, role, status, page = 1, limit = 20 }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  query[role === 'seller' ? 'seller' : 'buyer'] = userId;
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    transactionModel.find(query).populate('listing', 'title images unit').sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    transactionModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

// Reserved inventory that never got paid for within the reservation
// window is released back to available stock. Mirrors offer.service.js's
// expireStaleOffers() — same "not scheduled yet, wired in app.js" pattern.
async function expireStaleReservations() {
  const stale = await transactionModel.find({
    status: TRANSACTION_STATES.PAYMENT_PENDING,
    reservationExpiresAt: { $lt: new Date() },
  });
  for (const txn of stale) {
    await materialListingModel.updateOne(
      { _id: txn.listing },
      { $inc: { availableQuantity: txn.agreedQuantity, reservedQuantity: -txn.agreedQuantity } }
    );
    await materialListingModel.updateOne(
      { _id: txn.listing, status: LISTING_STATES.SOLD_OUT, availableQuantity: { $gt: 0 } },
      { $set: { status: LISTING_STATES.LIVE } }
    );
    txn.status = TRANSACTION_STATES.CANCELLED;
    txn.history.push({ action: 'RESERVATION_EXPIRED', by: 'system' });
    await txn.save();
  }
  return { released: stale.length };
}

module.exports = {
  TransactionError, calculateCommission, markPaymentConfirmed, markHandover,
  confirmReceipt, raiseDispute, getOne, myTransactions, expireStaleReservations,
};