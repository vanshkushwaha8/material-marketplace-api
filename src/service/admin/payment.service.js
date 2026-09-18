const paymentModel = require('../../model/payment.model');
const deleteConstants = require('../../constants/delete.constants');

// Masks anything that looks like an account/UTR down to the last 4 chars —
// "do not expose sensitive full bank account numbers" requirement.
function mask(value) {
  if (!value || typeof value !== 'string' || value.length <= 4) return value;
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

async function list({ page = 1, limit = 20, status, buyerId, sellerId, from, to }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  if (buyerId) query.buyer = buyerId;
  if (sellerId) query.seller = sellerId;
  if (from || to) query.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [rows, count] = await Promise.all([
    paymentModel.find(query)
      .populate('buyer', 'fullName email').populate('seller', 'fullName email')
      .populate({ path: 'transaction', select: 'listing agreedQuantity unitPrice agreedAmount status', populate: { path: 'listing', select: 'title unit' } })
      .sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    paymentModel.countDocuments(query),
  ]);

  const getData = rows.map((p) => ({
    ...p,
    refunds: (p.refunds || []).map((r) => ({ ...r, providerRefundId: mask(r.providerRefundId) })),
  }));
  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { list };