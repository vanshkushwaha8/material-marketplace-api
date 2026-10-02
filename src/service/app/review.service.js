const mongoose = require('mongoose');
const reviewModel = require('../../model/review.model');
const transactionModel = require('../../model/transaction.model');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const userTypeConstants = require('../../constants/usertype.constants');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../../constants/review.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const cache = require('../../helper/cache.helper');

const RATING_TTL_S = 15 * 60;
// Drop a seller's cached rating summary after any change to their ratings.
const dropRatingCache = (sellerId) => cache.del(cache.NAMESPACES.SELLER_RATING, String(sellerId));

class ReviewError extends Error {
  constructor(message, statusCode = 400, errorCode = null) { super(message); this.name = 'ReviewError'; this.statusCode = statusCode; this.errorCode = errorCode; }
}

// Counts toward public stats. `$nin` (not `status: 'ACTIVE'`) so reviews
// written before `status` existed still count.
const COUNTS = { status: { $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] }, is_deleted: deleteConstants.NOT_DELETED };

const toId = (id) => new mongoose.Types.ObjectId(String(id));

// ---------------------------------------------------------------------------
// Eligibility — enforced HERE, never only in the UI.
// A review needs a real order (transaction) that:
//   * the reviewer is a party to (buyer→seller or seller→buyer),
//   * is COMPLETED (buyer confirmed receipt; not cancelled / refunded /
//     disputed — those statuses are never COMPLETED),
//   * has no review yet in that direction (unique index backs this up
//     against concurrent double-submits).
// Following, viewing or sharing a seller grants nothing.
// ---------------------------------------------------------------------------
async function submitReview({ transactionId, userId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new ReviewError('Invalid transaction id', 404);
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new ReviewError('Transaction not found', 404);
  if (txn.status !== TRANSACTION_STATES.COMPLETED || txn.disputed) {
    throw new ReviewError('You can rate only after the order is completed', 409, 'REVIEW_NOT_ELIGIBLE');
  }

  // Role + counterparty come from the transaction, never from the client.
  let reviewerRole, reviewee;
  if (String(txn.buyer) === String(userId)) { reviewerRole = REVIEWER_ROLES.BUYER; reviewee = txn.seller; }
  else if (String(txn.seller) === String(userId)) { reviewerRole = REVIEWER_ROLES.SELLER; reviewee = txn.buyer; }
  else throw new ReviewError('You are not a party to this transaction', 403);
  if (String(reviewee) === String(userId)) throw new ReviewError('You cannot rate yourself', 403);

  let review;
  try {
    review = await reviewModel.create({
      transaction: txn._id, reviewer: userId, reviewerRole, reviewee,
      rating: body.rating, comment: body.comment || '', status: REVIEW_STATUS.ACTIVE,
    });
  } catch (err) {
    if (err.code === 11000) throw new ReviewError('You already rated this order — edit your existing rating instead', 409, 'REVIEW_EXISTS');
    throw err;
  }

  if (reviewerRole === REVIEWER_ROLES.BUYER) await dropRatingCache(reviewee);
  await createAuditLog({ req, userId, action: auditLogConstants.REVIEW_CREATED, entity: 'reviews', entityId: review._id, metadata: { transactionId: txn._id, rating: review.rating } });
  await notificationService.createNotification({
    recipientId: reviewee, actorId: userId,
    type: NOTIFICATION_TYPES.REVIEW_RECEIVED,
    title: 'You received a new rating',
    message: (actorName) => `${actorName || 'The other party'} rated you ${body.rating}/5`,
    entityType: 'transaction', entityId: txn._id,
  });
  return review;
}

// Owner may change ONLY rating + comment. Hidden (moderated) or
// invalidated reviews are locked; the order must still be eligible.
async function updateMyReview({ reviewId, userId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) throw new ReviewError('Invalid review id', 404);
  const review = await reviewModel.findOne({ _id: reviewId, is_deleted: deleteConstants.NOT_DELETED });
  if (!review || String(review.reviewer) !== String(userId)) throw new ReviewError('Review not found', 404); // never reveal others' reviews
  if (review.status === REVIEW_STATUS.HIDDEN) throw new ReviewError('This rating was removed by a moderator and can no longer be edited', 409);
  if (review.status === REVIEW_STATUS.INVALIDATED) throw new ReviewError('This order is no longer eligible for a rating', 409);
  const txn = await transactionModel.findById(review.transaction).select('status disputed').lean();
  if (!txn || txn.status !== TRANSACTION_STATES.COMPLETED || txn.disputed) throw new ReviewError('This order is no longer eligible for a rating', 409);

  const before = { rating: review.rating, comment: review.comment };
  review.rating = body.rating;
  review.comment = body.comment ?? review.comment;
  review.editedAt = new Date();
  await review.save();
  if (review.reviewerRole === REVIEWER_ROLES.BUYER) await dropRatingCache(review.reviewee);
  await createAuditLog({ req, userId, action: auditLogConstants.REVIEW_UPDATED, entity: 'reviews', entityId: review._id, metadata: { before, after: { rating: review.rating, comment: review.comment } } });
  return review;
}

/**
 * Public rating stats for sellers (buyer→seller reviews that count).
 * @returns Map sellerId -> { average, count, distribution }
 */
// Cached per seller (15 min): runs for every seller on every search page.
// Invalidated on create / edit / moderate / refund-invalidate below.
async function getSellerRatingStats(sellerIds) {
  const ids = [...new Set(sellerIds.map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) return new Map();
  return cache.getManyOrSet(cache.NAMESPACES.SELLER_RATING, ids, RATING_TTL_S, (missing) => aggregateSellerRatingStats(missing));
}

async function aggregateSellerRatingStats(sellerIdStrings) {
  const ids = sellerIdStrings.map(toId);
  const rows = await reviewModel.aggregate([
    { $match: { reviewee: { $in: ids }, reviewerRole: REVIEWER_ROLES.BUYER, ...COUNTS } },
    { $group: { _id: { seller: '$reviewee', rating: '$rating' }, n: { $sum: 1 } } },
  ]);
  const out = new Map();
  for (const { _id, n } of rows) {
    const key = String(_id.seller);
    const s = out.get(key) || { sum: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    s.sum += _id.rating * n;
    s.count += n;
    s.distribution[_id.rating] = (s.distribution[_id.rating] || 0) + n;
    out.set(key, s);
  }
  for (const [key, s] of out) out.set(key, { average: Math.round((s.sum / s.count) * 10) / 10, count: s.count, distribution: s.distribution });
  return out;
}

async function sellerRatingSummary(sellerId) {
  const stats = (await getSellerRatingStats([sellerId])).get(String(sellerId));
  return stats || { average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}

async function assertSeller(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new ReviewError('Seller not found', 404);
  const seller = await userModel.findOne({ _id: sellerId, userType: userTypeConstants.Seller, is_deleted: deleteConstants.NOT_DELETED }).select('_id').lean();
  if (!seller) throw new ReviewError('Seller not found', 404);
  return seller;
}

// Public list of a seller's ratings (counting ones only). Reviewer shown by
// first name only.
async function publicSellerReviews({ sellerId, page = 1, limit = 10 }) {
  await assertSeller(sellerId);
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const query = { reviewee: toId(sellerId), reviewerRole: REVIEWER_ROLES.BUYER, ...COUNTS };
  const [rows, count, summary] = await Promise.all([
    reviewModel.find(query).populate('reviewer', 'fullName').populate({ path: 'transaction', select: 'listing', populate: { path: 'listing', select: 'title' } })
      .sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    reviewModel.countDocuments(query),
    sellerRatingSummary(sellerId),
  ]);
  return {
    summary,
    getData: rows.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      reviewerName: (r.reviewer?.fullName || 'Buyer').trim().split(/\s+/)[0],
      material: r.transaction?.listing?.title || null,
      createdAt: r.createdAt,
      edited: Boolean(r.editedAt),
    })),
    count, page: pageNum, limit: pageLimit,
  };
}

// What the signed-in buyer may do on this seller's page: completed orders
// still awaiting a rating, and their own existing ratings (editable unless
// moderated/invalidated).
async function myRatingStatus({ buyerId, sellerId }) {
  await assertSeller(sellerId);
  const orders = await transactionModel.find({
    buyer: buyerId, seller: sellerId, status: TRANSACTION_STATES.COMPLETED, disputed: { $ne: true }, is_deleted: deleteConstants.NOT_DELETED,
  }).select('listing agreedQuantity agreedAmount completedAt').populate('listing', 'title unit').sort({ completedAt: -1 }).limit(50).lean();
  const reviews = await reviewModel.find({ reviewer: buyerId, reviewee: sellerId, reviewerRole: REVIEWER_ROLES.BUYER, is_deleted: deleteConstants.NOT_DELETED })
    .select('transaction rating comment status createdAt editedAt').lean();
  const reviewedTxn = new Set(reviews.map((r) => String(r.transaction)));
  return {
    eligibleOrders: orders.filter((o) => !reviewedTxn.has(String(o._id))).map((o) => ({
      transactionId: o._id, material: o.listing?.title || 'Order', quantity: o.agreedQuantity, unit: o.listing?.unit || '', amount: o.agreedAmount, completedAt: o.completedAt,
    })),
    myReviews: reviews.map((r) => ({ ...r, editable: r.status !== REVIEW_STATUS.HIDDEN && r.status !== REVIEW_STATUS.INVALIDATED })),
  };
}

// Called when an order stops being eligible after it was rated (full
// refund). Keeps the record (history) but removes it from public stats.
async function invalidateForTransaction(transactionId, reason) {
  const affected = await reviewModel.find({ transaction: transactionId }).select('reviewee').lean();
  await reviewModel.updateMany(
    { transaction: transactionId, status: { $ne: REVIEW_STATUS.INVALIDATED } },
    { $set: { status: REVIEW_STATUS.INVALIDATED, 'moderation.reason': reason, 'moderation.at': new Date() } }
  );
  await Promise.all(affected.map((r) => dropRatingCache(r.reviewee)));
}

// Matches the account Reviews page: reviews ABOUT the current user.
async function myReceivedReviews({ userId, page = 1, limit = 20 }) {
  const query = { reviewee: userId, ...COUNTS };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [rows, count, agg] = await Promise.all([
    reviewModel.find(query).populate('reviewer', 'fullName storeName').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    reviewModel.countDocuments(query),
    reviewModel.aggregate([{ $match: { reviewee: toId(userId), ...COUNTS } }, { $group: { _id: null, average: { $avg: '$rating' } } }]),
  ]);
  return {
    average: agg[0]?.average ? Number(agg[0].average.toFixed(1)) : 0,
    count,
    recent: rows.map((r) => ({ seller: r.reviewer?.storeName || r.reviewer?.fullName, rating: r.rating, comment: r.comment, date: new Date(r.createdAt).toISOString().slice(0, 10) })),
    page: pageNum, limit: pageLimit,
  };
}

module.exports = {
  ReviewError, COUNTS, submitReview, updateMyReview, getSellerRatingStats, sellerRatingSummary,
  publicSellerReviews, myRatingStatus, invalidateForTransaction, myReceivedReviews,
};
