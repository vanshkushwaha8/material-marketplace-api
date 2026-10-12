const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const materialListingModel = require('../../model/materialListing.model');
const materialCategoryModel = require('../../model/materialCategory.model');
const payoutModel = require('../../model/payout.model');
const deleteConstants = require('../../constants/delete.constants');
const { TRANSACTION_STATES, COMMISSION_STATES } = require('../../constants/transaction.constants');
const { ESCROW_STATES } = require('../../constants/escrow.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { toPaise, fromPaise } = require('../../helper/money.helper');
const { orderRef } = require('../../helper/orderRef.helper');

// Admin "Commission & Revenue Analytics".
//
// Source of truth: each transaction's own commission snapshot (rate, amount,
// tax, seller type — locked at payment capture, never recomputed from
// today's rates) plus its payout record. Every paid order is classified once
// by classify() below; totals are integer-paise sums of those
// classifications, so a duplicate webhook or a retried refund can't count
// twice (one transaction = one snapshot, one payout max).
//
// Terms (also shown on the page):
//   Gross order value   material subtotal (agreedAmount) of paid, not-refunded
//                       orders. NOT revenue — most of it belongs to sellers.
//   Commission accrued  collected at payment, seller not yet paid (COLLECTED).
//   Commission earned   seller payout confirmed PAID (SETTLED) — realised.
//   Commission reversed commission on orders refunded to the buyer.
//   Net commission      earned − GST recorded on it. Where an earned order has
//   revenue             no tax snapshot, it's flagged rather than guessed.
// Commission basis is the material subtotal only: the buyer convenience fee
// and the delivery charge are excluded (transaction.service#markPaymentConfirmed).

const PENDING_SETTLEMENT = [ESCROW_STATES.BUYER_CONFIRMED, ESCROW_STATES.COMMISSION_DEDUCTED, ESCROW_STATES.RELEASE_PENDING, ESCROW_STATES.REQUIRES_ADMIN_ACTION];
const HELD = [ESCROW_STATES.PAID, ESCROW_STATES.HELD, ESCROW_STATES.DELIVERED];
const DISPUTED = [ESCROW_STATES.DISPUTED, ESCROW_STATES.ADMIN_REVIEW];
const MAX_EXPORT_ROWS = 5000;
const UNCATEGORISED = 'Uncategorised';

class AnalyticsError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'AnalyticsError'; this.statusCode = statusCode; }
}

const isOid = (v) => mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === String(v);

function parseDate(v, endOfDay = false) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AnalyticsError('Invalid date');
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Filters → { match (transactions), categoryId }. Pure; exported for tests. */
function buildMatch({ from, to, sellerType, status, settlementStatus, orderId, category } = {}) {
  const match = { is_deleted: deleteConstants.NOT_DELETED, paymentConfirmedAt: { $ne: null } };
  const f = parseDate(from);
  const t = parseDate(to, true);
  if (f && t && f > t) throw new AnalyticsError('"From" date must be before "To" date');
  if (f || t) match.paymentConfirmedAt = { $ne: null, ...(f && { $gte: f }), ...(t && { $lte: t }) };
  if (sellerType) {
    if (!Object.values(SELLER_TYPES).includes(sellerType)) throw new AnalyticsError('Unknown seller type');
    // Orders locked before seller types existed carry no snapshot = individual.
    match.commissionSellerType = sellerType === SELLER_TYPES.INDIVIDUAL ? { $in: [SELLER_TYPES.INDIVIDUAL, null] } : sellerType;
  }
  if (status) {
    if (!Object.values(TRANSACTION_STATES).includes(status)) throw new AnalyticsError('Unknown order status');
    match.status = status;
  }
  if (settlementStatus) {
    if (!Object.values(ESCROW_STATES).includes(settlementStatus)) throw new AnalyticsError('Unknown payment/settlement status');
    match.escrowStatus = settlementStatus;
  }
  if (orderId) {
    const q = String(orderId).trim().replace(/^#/, '');
    if (isOid(q)) match._id = new mongoose.Types.ObjectId(q);
    else if (/^[a-f0-9]{4,24}$/i.test(q)) match.$expr = { $regexMatch: { input: { $toString: '$_id' }, regex: `${q.toLowerCase()}$` } };
    else throw new AnalyticsError('Search by the order number (e.g. #1A2B3C4D) or full order id');
  }
  let categoryId = null;
  if (category) {
    if (!isOid(category)) throw new AnalyticsError('Unknown category');
    categoryId = new mongoose.Types.ObjectId(category);
  }
  return { match, categoryId };
}

// Joins only (listing → category, payout); all money logic is in classify().
function basePipeline({ match, categoryId }) {
  return [
    { $match: match },
    { $lookup: { from: materialListingModel.collection.name, localField: 'listing', foreignField: '_id', as: 'l' } },
    { $lookup: { from: payoutModel.collection.name, localField: '_id', foreignField: 'transaction', as: 'p' } },
    { $addFields: { l: { $arrayElemAt: ['$l', 0] }, p: { $arrayElemAt: ['$p', 0] } } },
    ...(categoryId ? [{ $match: { 'l.category': categoryId } }] : []),
    {
      $project: {
        status: 1, escrowStatus: 1, commissionStatus: 1, commissionSellerType: 1,
        agreedAmount: 1, agreedQuantity: 1, buyerFeeAmount: 1, deliveryCharge: 1,
        platformCommissionPct: 1, platformCommissionAmount: 1, sellerSettlementAmount: 1,
        commissionTaxAmount: 1, commissionTaxPct: 1, paymentConfirmedAt: 1, completedAt: 1, releasedAt: 1,
        listingTitle: '$l.title', unit: '$l.unit', category: '$l.category',
        payoutStatus: '$p.status', payoutNet: '$p.netPayoutAmount', payoutCommission: '$p.platformCommissionAmount',
      },
    },
  ];
}

/**
 * One paid order → its contribution to every metric, in paise. Pure.
 * Refunded orders contribute only to the "refunded / reversed" figures.
 */
function classify(r) {
  const refunded = r.commissionStatus === COMMISSION_STATES.REFUNDED || r.escrowStatus === ESCROW_STATES.REFUNDED;
  const agreed = toPaise(r.agreedAmount || 0);
  const commission = toPaise(r.platformCommissionAmount || 0);
  const earned = !refunded && r.commissionStatus === COMMISSION_STATES.SETTLED ? commission : 0;
  const hasTax = r.commissionTaxAmount != null;
  const payoutPaid = r.payoutStatus === PAYOUT_STATES.PAID;
  return {
    orders: 1,
    gross: refunded ? 0 : agreed,
    refundedValue: refunded ? agreed : 0,
    commissionGross: refunded ? 0 : commission,
    accrued: !refunded && r.commissionStatus === COMMISSION_STATES.COLLECTED ? commission : 0,
    earned,
    reversed: refunded ? commission : 0,
    tax: earned && hasTax ? toPaise(r.commissionTaxAmount) : 0,
    taxAccrued: !refunded && hasTax ? toPaise(r.commissionTaxAmount) : 0,
    earnedWithoutTax: earned && !hasTax ? 1 : 0,
    pendingSettlement: PENDING_SETTLEMENT.includes(r.escrowStatus) ? toPaise(r.payoutNet ?? r.sellerSettlementAmount ?? 0) : 0,
    held: HELD.includes(r.escrowStatus) ? agreed : 0,
    disputed: DISPUTED.includes(r.escrowStatus) ? agreed : 0,
    payoutsPaid: payoutPaid ? toPaise(r.payoutNet || 0) : 0,
    payoutCommission: payoutPaid ? toPaise(r.payoutCommission || 0) : 0,
    buyerFees: refunded ? 0 : toPaise(r.buyerFeeAmount || 0),
    completed: r.status === TRANSACTION_STATES.COMPLETED ? 1 : 0,
    refundedOrders: refunded ? 1 : 0,
  };
}

const ZERO = () => Object.fromEntries(Object.keys(classify({})).map((k) => [k, 0]));
const add = (acc, c) => { for (const k of Object.keys(c)) acc[k] += c[k]; return acc; };
const COUNT_KEYS = ['orders', 'earnedWithoutTax', 'completed', 'refundedOrders'];
const toRupees = (acc) => Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, COUNT_KEYS.includes(k) ? v : fromPaise(v)]));

// IST calendar buckets; monthly once the range is long.
function bucketKey(date, granularity) {
  const ist = new Date(new Date(date).getTime() + 330 * 60 * 1000);
  const iso = ist.toISOString();
  return granularity === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
}

/** Pure aggregation over classified rows — exported for tests. */
function aggregate(rows, { granularity = 'day', categoryNames = new Map() } = {}) {
  const total = ZERO();
  const byCategory = new Map();
  const bySeries = new Map();
  for (const r of rows) {
    const c = classify(r);
    add(total, c);
    const catKey = r.category ? String(r.category) : 'none';
    if (!byCategory.has(catKey)) byCategory.set(catKey, { ...ZERO(), rates: new Set() });
    const cat = byCategory.get(catKey);
    add(cat, c);
    if (r.platformCommissionPct != null) cat.rates.add(Number(r.platformCommissionPct));
    const b = bucketKey(r.paymentConfirmedAt, granularity);
    if (!bySeries.has(b)) bySeries.set(b, ZERO());
    add(bySeries.get(b), c);
  }

  const t = toRupees(total);
  const taxRecorded = total.earned > 0 && total.earnedWithoutTax === 0;
  const summary = {
    ...t,
    netCommissionRevenue: fromPaise(total.earned - total.tax),
    taxComplete: total.earned === 0 ? null : taxRecorded,
    taxAvailable: total.tax > 0 || total.taxAccrued > 0,
    reconciliation: {
      // Earned commission (transactions) must equal the commission on PAID
      // payouts (payouts collection) — they are written together.
      earnedFromOrders: t.earned,
      commissionOnPaidPayouts: t.payoutCommission,
      matches: total.earned === total.payoutCommission,
    },
  };

  const categories = [...byCategory.entries()].map(([key, v]) => {
    const { rates, ...sums } = v;
    const r = toRupees(sums);
    return {
      categoryId: key === 'none' ? null : key,
      category: key === 'none' ? UNCATEGORISED : (categoryNames.get(key) || UNCATEGORISED),
      orders: r.orders,
      grossValue: r.gross,
      commissionRates: [...rates].sort((a, b) => a - b),
      grossCommission: r.commissionGross,
      commissionTax: sums.tax || sums.taxAccrued ? r.taxAccrued : null,
      reversed: r.reversed,
      netCommissionRevenue: fromPaise(sums.earned - sums.tax),
      earned: r.earned,
      sellerPayouts: r.payoutsPaid,
      refundedValue: r.refundedValue,
    };
  }).sort((a, b) => b.grossValue - a.grossValue);

  const series = [...bySeries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => {
    const r = toRupees(v);
    return { period, grossValue: r.gross, commissionEarned: r.earned, commissionAccrued: r.accrued, reversed: r.reversed, refundedValue: r.refundedValue, payoutsPaid: r.payoutsPaid, pendingSettlement: r.pendingSettlement, orders: r.orders };
  });

  return { summary, categories, series };
}

function granularityFor(match, firstDate) {
  const range = match.paymentConfirmedAt || {};
  const start = range.$gte || firstDate || new Date();
  const end = range.$lte || new Date();
  return (end - start) / 86400000 > 120 ? 'month' : 'day';
}

async function loadCategoryNames() {
  const cats = await materialCategoryModel.find({ is_deleted: '0', parentCategory: null }).select('name status').sort({ name: 1 }).lean();
  return { names: new Map(cats.map((c) => [String(c._id), c.name])), list: cats.map((c) => ({ _id: c._id, name: c.name, status: c.status })) };
}

/** KPI cards + category breakdown + time series for the current filters. */
async function overview(query = {}) {
  const built = buildMatch(query);
  const [{ names, list }, rows] = await Promise.all([
    loadCategoryNames(),
    transactionModel.aggregate(basePipeline(built)).allowDiskUse(true),
  ]);
  const firstDate = rows.reduce((min, r) => (!min || r.paymentConfirmedAt < min ? r.paymentConfirmedAt : min), null);
  const granularity = granularityFor(built.match, firstDate);
  const result = aggregate(rows, { granularity, categoryNames: names });
  return { ...result, granularity, filterOptions: { categories: list, sellerTypes: Object.values(SELLER_TYPES), orderStatuses: Object.values(TRANSACTION_STATES), settlementStatuses: Object.values(ESCROW_STATES) } };
}

function toRow(r, names) {
  const c = classify(r);
  return {
    transactionId: r._id,
    orderRef: orderRef(r._id),
    material: r.listingTitle || '—',
    category: r.category ? (names.get(String(r.category)) || UNCATEGORISED) : UNCATEGORISED,
    sellerType: r.commissionSellerType || SELLER_TYPES.INDIVIDUAL,
    quantity: r.agreedQuantity, unit: r.unit || '',
    grossValue: r.agreedAmount,
    commissionRate: r.platformCommissionPct,
    commission: r.platformCommissionAmount,
    commissionTax: r.commissionTaxAmount,
    commissionStatus: r.commissionStatus,
    netCommissionRevenue: fromPaise(c.earned - c.tax),
    sellerPayout: r.payoutNet ?? null,
    payoutStatus: r.payoutStatus || null,
    orderStatus: r.status,
    settlementStatus: r.escrowStatus,
    paidAt: r.paymentConfirmedAt,
    completedAt: r.completedAt,
  };
}

/** Paginated order-level rows (same filters); `all` for CSV export. */
async function orders(query = {}, { all = false } = {}) {
  const built = buildMatch(query);
  const pageNum = Math.max(1, Number(query.page) || 1);
  const pageLimit = all ? MAX_EXPORT_ROWS : Math.min(100, Number(query.limit) || 20);
  const [{ names }, [res]] = await Promise.all([
    loadCategoryNames(),
    transactionModel.aggregate([
      ...basePipeline(built),
      { $sort: { paymentConfirmedAt: -1, _id: -1 } },
      { $facet: { rows: [{ $skip: all ? 0 : (pageNum - 1) * pageLimit }, { $limit: pageLimit }], count: [{ $count: 'n' }] } },
    ]).allowDiskUse(true),
  ]);
  return { getData: (res?.rows || []).map((r) => toRow(r, names)), count: res?.count?.[0]?.n || 0, page: pageNum, limit: pageLimit, truncated: all && (res?.count?.[0]?.n || 0) > MAX_EXPORT_ROWS };
}

const CSV_COLUMNS = [
  ['orderRef', 'Order'], ['transactionId', 'Transaction ID'], ['paidAt', 'Paid at'], ['material', 'Material'], ['category', 'Category'],
  ['sellerType', 'Seller type'], ['quantity', 'Quantity'], ['unit', 'Unit'], ['grossValue', 'Gross value (INR)'], ['commissionRate', 'Commission %'],
  ['commission', 'Commission (INR)'], ['commissionTax', 'GST on commission (INR)'], ['commissionStatus', 'Commission status'],
  ['netCommissionRevenue', 'Net commission revenue (INR)'], ['sellerPayout', 'Seller payout (INR)'], ['payoutStatus', 'Payout status'],
  ['orderStatus', 'Order status'], ['settlementStatus', 'Settlement status'],
];
const csvCell = (v) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportCsv(query = {}) {
  const { getData, truncated } = await orders(query, { all: true });
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(',')];
  for (const r of getData) lines.push(CSV_COLUMNS.map(([k]) => csvCell(r[k])).join(','));
  return { csv: lines.join('\n'), truncated };
}

module.exports = { AnalyticsError, buildMatch, classify, aggregate, overview, orders, exportCsv, bucketKey };
