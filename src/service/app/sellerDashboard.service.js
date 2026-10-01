const mongoose = require('mongoose');
const materialListingModel = require('../../model/materialListing.model');
const transactionModel = require('../../model/transaction.model');
const payoutModel = require('../../model/payout.model');
const reviewModel = require('../../model/review.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../../constants/review.constants');
const offerService = require('./offer.service');
const payoutService = require('./payout.service');

// One aggregate for the seller dashboard. Previously the page downloaded up
// to 200 listings + 200 offers + 200 payouts and summed them in the browser
// (wrong totals past 200, slow on mobile). Everything here is computed by
// MongoDB and scoped to the authenticated seller.

// "Low stock": LIVE listing with ≤ 10% of its total left (min 1 unit).
const LOW_STOCK_RATIO = 0.1;
const MONTHS_OF_EARNINGS = 6;

const countByStatus = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id]: r.n }), {});

async function getSummary(sellerId) {
  const seller = new mongoose.Types.ObjectId(String(sellerId));
  const notDeleted = { is_deleted: deleteConstants.NOT_DELETED };
  const since = new Date();
  since.setMonth(since.getMonth() - (MONTHS_OF_EARNINGS - 1), 1);
  since.setHours(0, 0, 0, 0);

  const [
    listingRows, lowStock, recentListings,
    offerInbox,
    txnRows, handoverQueue,
    payoutRows, monthlyEarnings, payoutAttention,
    ratingRows, payoutReadiness,
  ] = await Promise.all([
    materialListingModel.aggregate([{ $match: { seller, ...notDeleted } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    materialListingModel.find({
      seller, ...notDeleted, status: LISTING_STATES.LIVE,
      $expr: { $lte: ['$availableQuantity', { $max: [1, { $multiply: ['$quantity', LOW_STOCK_RATIO] }] }] },
    }).select('title availableQuantity quantity unit').sort({ availableQuantity: 1 }).limit(5).lean(),
    materialListingModel.find({ seller, ...notDeleted })
      .select('title status price unit quantity availableQuantity images createdAt rejectionReason')
      .populate('category', 'name').sort({ createdAt: -1 }).limit(6).lean(),

    // Reuses the offers inbox so "your turn" means exactly the same thing here.
    offerService.myOffers({ userId: seller, role: 'seller', view: 'action', limit: 5 }),

    transactionModel.aggregate([
      { $match: { seller, ...notDeleted } },
      { $group: { _id: '$status', n: { $sum: 1 }, settlement: { $sum: { $ifNull: ['$sellerSettlementAmount', 0] } } } },
    ]),
    transactionModel.find({ seller, ...notDeleted, status: TRANSACTION_STATES.PAYMENT_CONFIRMED })
      .select('listing agreedQuantity agreedAmount sellerSettlementAmount paymentConfirmedAt')
      .populate('listing', 'title unit').sort({ paymentConfirmedAt: 1 }).limit(5).lean(),

    payoutModel.aggregate([
      { $match: { seller, ...notDeleted } },
      { $group: { _id: '$status', n: { $sum: 1 }, net: { $sum: '$netPayoutAmount' } } },
    ]),
    payoutModel.aggregate([
      { $match: { seller, ...notDeleted, status: PAYOUT_STATES.PAID, processedAt: { $gte: since } } },
      { $group: { _id: { y: { $year: '$processedAt' }, m: { $month: '$processedAt' } }, net: { $sum: '$netPayoutAmount' } } },
    ]),
    payoutModel.find({ seller, ...notDeleted, status: { $in: [PAYOUT_STATES.PAYOUT_FAILED, PAYOUT_STATES.PAYOUT_ELIGIBLE] } })
      .select('status netPayoutAmount failureReason transaction').limit(5).lean(),

    reviewModel.aggregate([
      { $match: { reviewee: seller, reviewerRole: REVIEWER_ROLES.BUYER, status: { $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] }, ...notDeleted } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    payoutService.getPayoutReadiness(seller),
  ]);

  const listingsByStatus = countByStatus(listingRows);
  const txnByStatus = txnRows.reduce((acc, r) => ({ ...acc, [r._id]: r }), {});
  const payoutsByStatus = payoutRows.reduce((acc, r) => ({ ...acc, [r._id]: r }), {});
  const sumNet = (states) => states.reduce((s, st) => s + (payoutsByStatus[st]?.net || 0), 0);

  // Money already paid by buyers but not yet released to the seller
  // (payment confirmed / handover in progress / disputed), plus payouts
  // created but not yet PAID.
  const inFlightSettlement = [TRANSACTION_STATES.PAYMENT_CONFIRMED, TRANSACTION_STATES.HANDOVER_STARTED, TRANSACTION_STATES.BUYER_INSPECTION, TRANSACTION_STATES.DISPUTED]
    .reduce((s, st) => s + (txnByStatus[st]?.settlement || 0), 0);

  // Zero-filled month series so the chart shows gaps honestly.
  const earningsByMonth = [];
  for (let i = 0; i < MONTHS_OF_EARNINGS; i += 1) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    const hit = monthlyEarnings.find((r) => r._id.y === d.getFullYear() && r._id.m === d.getMonth() + 1);
    earningsByMonth.push({ month: d.toLocaleString('en-IN', { month: 'short' }), year: d.getFullYear(), net: Math.round((hit?.net || 0) * 100) / 100 });
  }

  return {
    kpis: {
      earningsPaid: sumNet([PAYOUT_STATES.PAID]),
      pendingSettlement: inFlightSettlement + sumNet([PAYOUT_STATES.PENDING, PAYOUT_STATES.PAYOUT_ELIGIBLE, PAYOUT_STATES.PROCESSING, PAYOUT_STATES.PAYOUT_FAILED]),
      liveListings: listingsByStatus[LISTING_STATES.LIVE] || 0,
      totalListings: Object.values(listingsByStatus).reduce((a, b) => a + b, 0),
      offersAwaitingYou: offerInbox.counts.action,
      openNegotiations: offerInbox.counts.action + offerInbox.counts.waiting,
      completedSales: txnByStatus[TRANSACTION_STATES.COMPLETED]?.n || 0,
      rating: ratingRows[0] ? { average: Math.round(ratingRows[0].avg * 10) / 10, count: ratingRows[0].count } : { average: null, count: 0 },
    },
    attention: {
      offers: offerInbox.getData,
      handovers: handoverQueue,
      awaitingBuyerPayment: txnByStatus[TRANSACTION_STATES.PAYMENT_PENDING]?.n || 0,
      disputed: txnByStatus[TRANSACTION_STATES.DISPUTED]?.n || 0,
      rejectedListings: listingsByStatus[LISTING_STATES.REJECTED] || 0,
      draftListings: listingsByStatus[LISTING_STATES.DRAFT] || 0,
      lowStock,
      payouts: payoutAttention,
      payoutReadiness: payoutReadiness.readiness,
    },
    listingsByStatus,
    offerCounts: offerInbox.counts,
    earningsByMonth,
    recentListings,
  };
}

module.exports = { getSummary };
