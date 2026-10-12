const mongoose = require('mongoose');
const paymentModel = require('../../model/payment.model');
const userModel = require('../../model/user.model');
const transactionModel = require('../../model/transaction.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYMENT_STATES } = require('../../constants/payment.constants');

class PaymentHistoryError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'PaymentHistoryError'; this.statusCode = statusCode; }
}

// Masks anything that looks like an account/UTR down to the last 4 chars —
// "do not expose sensitive full bank account numbers" requirement.
function mask(value) {
  if (!value || typeof value !== 'string' || value.length <= 4) return value;
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

// Query-string values are always treated as plain strings (never objects),
// and user text is regex-escaped — no operator injection via ?q[$ne]=…
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_MATCHES = 500; // cap on ids pulled in by a name/title search

function parseDate(v, endOfDay) {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new PaymentHistoryError('Invalid date');
  // A bare "YYYY-MM-DD" "To" date includes that whole day.
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(s)) d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Search box: provider order/payment id, order number (#1A2B3C4D or the
 * full transaction id), buyer/seller name or email, listing title.
 * Returns a Mongo $or clause, or null when nothing can match.
 */
async function searchClause(raw) {
  const q = str(raw).slice(0, 100);
  if (!q) return undefined;
  const rx = new RegExp(escapeRegex(q), 'i');
  const or = [{ providerOrderId: rx }, { providerPaymentId: rx }];

  const ref = q.replace(/^#/, '');
  if (mongoose.Types.ObjectId.isValid(ref) && /^[a-f0-9]{24}$/i.test(ref)) {
    or.push({ transaction: new mongoose.Types.ObjectId(ref) }, { _id: new mongoose.Types.ObjectId(ref) });
  } else if (/^[a-f0-9]{6,23}$/i.test(ref)) {
    // Order number shown to users = last 8 hex chars of the transaction id.
    or.push({ $expr: { $regexMatch: { input: { $toString: '$transaction' }, regex: `${ref.toLowerCase()}$` } } });
  }

  const [users, listings] = await Promise.all([
    userModel.find({ $or: [{ fullName: rx }, { email: rx }] }).select('_id').limit(MAX_MATCHES).lean(),
    materialListingModel.find({ title: rx }).select('_id').limit(MAX_MATCHES).lean(),
  ]);
  if (users.length) {
    const ids = users.map((u) => u._id);
    or.push({ buyer: { $in: ids } }, { seller: { $in: ids } });
  }
  if (listings.length) {
    const txns = await transactionModel.find({ listing: { $in: listings.map((l) => l._id) } }).select('_id').limit(MAX_MATCHES * 4).lean();
    if (txns.length) or.push({ transaction: { $in: txns.map((t) => t._id) } });
  }
  return or;
}

const REFUND_FILTERS = {
  // Any refund activity: fully/partly refunded, or a refund requested.
  ANY: { $or: [{ status: { $in: [PAYMENT_STATES.REFUNDED, PAYMENT_STATES.PARTIALLY_REFUNDED] } }, { 'refunds.0': { $exists: true } }] },
  NONE: { status: { $nin: [PAYMENT_STATES.REFUNDED, PAYMENT_STATES.PARTIALLY_REFUNDED] }, 'refunds.0': { $exists: false } },
};

/** Filters → Mongo query. Exported for tests. */
async function buildQuery(params = {}) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  const and = [];

  const status = str(params.status);
  if (status) {
    if (!Object.values(PAYMENT_STATES).includes(status)) throw new PaymentHistoryError('Unknown payment status');
    query.status = status;
  }
  const method = str(params.method).toLowerCase();
  if (method) {
    if (!/^[a-z_]{2,30}$/.test(method)) throw new PaymentHistoryError('Unknown payment method');
    query.method = method;
  }
  const refund = str(params.refund).toUpperCase();
  if (refund) {
    if (!REFUND_FILTERS[refund]) throw new PaymentHistoryError('Unknown refund filter');
    and.push(REFUND_FILTERS[refund]);
  }
  if (str(params.reconciliation) === 'true') query.reconciliationRequired = true;

  for (const key of ['buyerId', 'sellerId']) {
    const v = str(params[key]);
    if (v) {
      if (!mongoose.Types.ObjectId.isValid(v)) throw new PaymentHistoryError(`Invalid ${key}`);
      query[key === 'buyerId' ? 'buyer' : 'seller'] = new mongoose.Types.ObjectId(v);
    }
  }

  const from = parseDate(params.from, false);
  const to = parseDate(params.to, true);
  if (from && to && from > to) throw new PaymentHistoryError('"From" date must be before "To" date');
  if (from || to) query.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const min = str(params.minAmount) === '' ? null : Number(params.minAmount);
  const max = str(params.maxAmount) === '' ? null : Number(params.maxAmount);
  if ((min != null && !(min >= 0)) || (max != null && !(max >= 0))) throw new PaymentHistoryError('Amount must be a positive number');
  if (min != null && max != null && min > max) throw new PaymentHistoryError('Minimum amount must be less than maximum');
  if (min != null || max != null) {
    query.amountPaise = { ...(min != null && { $gte: Math.round(min * 100) }), ...(max != null && { $lte: Math.round(max * 100) }) };
  }

  const search = await searchClause(params.q);
  if (search) and.push({ $or: search });
  if (and.length) query.$and = and;
  return query;
}

async function list(params = {}) {
  const query = await buildQuery(params);
  const pageNum = Math.max(1, Number(params.page) || 1);
  const pageLimit = Math.min(100, Number(params.limit) || 20);
  const [rows, count, totals] = await Promise.all([
    paymentModel.find(query)
      .populate('buyer', 'fullName email').populate('seller', 'fullName email')
      .populate({ path: 'transaction', select: 'listing agreedQuantity unitPrice agreedAmount status', populate: { path: 'listing', select: 'title unit' } })
      .sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    paymentModel.countDocuments(query),
    // Totals for the filtered set, per status (shown above the table).
    paymentModel.aggregate([{ $match: query }, { $group: { _id: '$status', count: { $sum: 1 }, amountPaise: { $sum: '$amountPaise' } } }]),
  ]);

  const getData = rows.map((p) => ({
    ...p,
    refunds: (p.refunds || []).map((r) => ({ ...r, providerRefundId: mask(r.providerRefundId) })),
  }));
  const summary = Object.fromEntries(totals.map((t) => [t._id, { count: t.count, amount: t.amountPaise / 100 }]));
  return { getData, count, page: pageNum, limit: pageLimit, summary };
}

module.exports = { PaymentHistoryError, buildQuery, list };
