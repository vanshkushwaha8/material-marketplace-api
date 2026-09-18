const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const paymentModel = require('../../model/payment.model');
const payoutModel = require('../../model/payout.model');
const deleteConstants = require('../../constants/delete.constants');

// Real admin "Transaction History" — every transaction regardless of
// status, joined against its payment and payout records so admin can see
// payment/handover/settlement state in one place. (Previously this read
// ACCEPTED offers as a placeholder before the Transaction/Payment models
// existed; those now exist, so this reads them directly.)
async function list({ page = 1, limit = 20, search, status, from, to }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  if (from || to) query.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  if (search) {
    const materialListingModel = require('../../model/materialListing.model');
    const matches = await materialListingModel.find({ title: { $regex: search, $options: 'i' } }).select('_id');
    query.listing = { $in: matches.map((m) => m._id) };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  const [rows, count] = await Promise.all([
    transactionModel.find(query)
      .populate('listing', 'title unit')
      .populate('buyer', 'fullName email')
      .populate('seller', 'fullName email')
      .sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    transactionModel.countDocuments(query),
  ]);

  const transactionIds = rows.map((t) => t._id);
  const [payments, payouts] = transactionIds.length
    ? await Promise.all([
        paymentModel.find({ transaction: { $in: transactionIds } }).select('transaction status method provider providerPaymentId providerOrderId').lean(),
        payoutModel.find({ transaction: { $in: transactionIds } }).select('transaction status netPayoutAmount').lean(),
      ])
    : [[], []];
  const paymentByTxnId = new Map(payments.map((p) => [String(p.transaction), p]));
  const payoutByTxnId = new Map(payouts.map((p) => [String(p.transaction), p]));

  const getData = rows.map((t) => {
    const payment = paymentByTxnId.get(String(t._id)) || null;
    const payout = payoutByTxnId.get(String(t._id)) || null;
    return {
      transactionId: t._id,
      listing: t.listing,
      buyer: t.buyer,
      seller: t.seller,
      quantity: t.agreedQuantity,
      unit: t.listing?.unit,
      unitPrice: t.unitPrice,
      grossAmount: t.agreedAmount,
      currency: t.currency,
      transactionStatus: t.status,
      paymentStatus: payment?.status || null,
      paymentMethod: payment?.method || null,
      handoverStatus: t.handoverStartedAt ? 'HANDED_OVER' : 'PENDING',
      buyerConfirmed: Boolean(t.buyerConfirmedAt),
      disputed: t.disputed,
      commissionRate: t.platformCommissionPct,
      commissionAmount: t.platformCommissionAmount,
      sellerSettlementAmount: t.sellerSettlementAmount,
      settlementStatus: t.settlementStatus,
      payoutStatus: payout?.status || null,
      createdAt: t.createdAt,
      paymentConfirmedAt: t.paymentConfirmedAt,
      completedAt: t.completedAt,
    };
  });

  return { getData, count, page: pageNum, limit: pageLimit };
}

// Full detail + timeline for the admin transaction-detail screen.
async function getOne(transactionId) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    const err = new Error('Invalid transaction id'); err.statusCode = 404; throw err;
  }
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('listing', 'title unit images')
    .populate('buyer', 'fullName email phone')
    .populate('seller', 'fullName email phone')
    .populate('offer')
    .lean();
  if (!txn) { const err = new Error('Transaction not found'); err.statusCode = 404; throw err; }

  const [payment, payout] = await Promise.all([
    paymentModel.findOne({ transaction: txn._id }).lean(),
    payoutModel.findOne({ transaction: txn._id }).lean(),
  ]);

  return { ...txn, payment, payout };
}

module.exports = { list, getOne };
