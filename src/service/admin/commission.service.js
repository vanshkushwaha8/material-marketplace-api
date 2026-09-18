const transactionModel = require('../../model/transaction.model');
const paymentModel = require('../../model/payment.model');
const deleteConstants = require('../../constants/delete.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');

// Commission only exists once a transaction has actually COMPLETED —
// platformCommissionAmount/sellerSettlementAmount are set exactly once,
// at that point, in transaction.service.js#confirmReceipt.
async function list({ page = 1, limit = 20, buyerId, sellerId, from, to }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED, status: TRANSACTION_STATES.COMPLETED };
  if (buyerId) query.buyer = buyerId;
  if (sellerId) query.seller = sellerId;
  if (from || to) query.completedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  const [rows, count] = await Promise.all([
    transactionModel.find(query)
      .populate('listing', 'title unit')
      .populate('buyer', 'fullName email')
      .populate('seller', 'fullName email')
      .sort({ completedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    transactionModel.countDocuments(query),
  ]);

  const transactionIds = rows.map((t) => t._id);
  const payments = transactionIds.length
    ? await paymentModel.find({ transaction: { $in: transactionIds } }).select('transaction status method providerPaymentId').lean()
    : [];
  const paymentByTxnId = new Map(payments.map((p) => [String(p.transaction), p]));

  const getData = rows.map((t) => ({
    commissionId: t._id, // one commission record per completed transaction — no separate collection needed
    transactionId: t._id,
    buyer: t.buyer,
    seller: t.seller,
    listing: t.listing,
    quantity: t.agreedQuantity,
    unitPrice: t.unitPrice,
    grossAmount: t.agreedAmount,
    commissionRate: t.platformCommissionPct,
    commissionAmount: t.platformCommissionAmount,
    sellerNetAmount: t.sellerSettlementAmount,
    currency: t.currency,
    paymentStatus: paymentByTxnId.get(String(t._id))?.status || null,
    paymentMethod: paymentByTxnId.get(String(t._id))?.method || null,
    settlementStatus: t.settlementStatus,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  }));

  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { list };