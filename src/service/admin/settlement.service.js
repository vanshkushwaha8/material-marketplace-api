const payoutModel = require('../../model/payout.model');
const deleteConstants = require('../../constants/delete.constants');

// Same masking convention as admin/payment.service.js#mask — never expose
// a full provider payout reference or bank identifier in the admin UI.
function mask(value) {
  if (!value || typeof value !== 'string' || value.length <= 4) return value;
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

// Admin "Seller Settlement History" — read-only view over real Payout
// records (backed by actual RazorpayX provider calls, never a bare DB
// balance). Bank account details come back masked; the seller's full
// account number was never persisted in the first place (see
// sellerBankAccount.schema.js).
async function list({ page = 1, limit = 20, status, sellerId, from, to }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  if (sellerId) query.seller = sellerId;
  if (from || to) query.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  const [rows, count] = await Promise.all([
    payoutModel.find(query)
      .populate('seller', 'fullName email')
      .populate({ path: 'transaction', select: 'listing agreedQuantity agreedAmount unitPrice status', populate: { path: 'listing', select: 'title unit' } })
      .populate('sellerBankAccount', 'bankName accountNumberLast4 ifsc')
      .sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    payoutModel.countDocuments(query),
  ]);

  const getData = rows.map((p) => ({
    settlementId: p._id,
    transactionId: p.transaction?._id || null,
    transactionStatus: p.transaction?.status || null,
    listing: p.transaction?.listing || null,
    seller: p.seller,
    quantity: p.transaction?.agreedQuantity ?? null,
    unitPrice: p.transaction?.unitPrice ?? null,
    grossAmount: p.grossAmount,
    platformCommissionAmount: p.platformCommissionAmount,
    paymentProcessingFeeAmount: p.paymentProcessingFeeAmount,
    netPayoutAmount: p.netPayoutAmount,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    providerPayoutId: mask(p.providerPayoutId),
    bank: p.sellerBankAccount
      ? { bankName: p.sellerBankAccount.bankName, accountLast4: p.sellerBankAccount.accountNumberLast4, ifsc: mask(p.sellerBankAccount.ifsc) }
      : null,
    failureReason: p.failureReason,
    eligibleAt: p.eligibleAt,
    processedAt: p.processedAt,
    createdAt: p.createdAt,
  }));

  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { list };
