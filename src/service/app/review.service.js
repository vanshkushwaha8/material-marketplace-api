const mongoose = require('mongoose');
const reviewModel = require('../../model/review.model');
const transactionModel = require('../../model/transaction.model');
const deleteConstants = require('../../constants/delete.constants');
const { REVIEWER_ROLES } = require('../../constants/review.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');

class ReviewError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'ReviewError'; this.statusCode = statusCode; }
}

// Only a party to a COMPLETED transaction can review the other party —
// this is the "Completion → Review" step in the workflow diagram.
async function submitReview({ transactionId, userId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new ReviewError('Invalid transaction id', 404);
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new ReviewError('Transaction not found', 404);
  if (txn.status !== TRANSACTION_STATES.COMPLETED) throw new ReviewError('You can only review a completed transaction', 409);

  let reviewerRole, reviewee;
  if (String(txn.buyer) === String(userId)) { reviewerRole = REVIEWER_ROLES.BUYER; reviewee = txn.seller; }
  else if (String(txn.seller) === String(userId)) { reviewerRole = REVIEWER_ROLES.SELLER; reviewee = txn.buyer; }
  else throw new ReviewError('You are not a party to this transaction', 403);

  let review;
  try {
    review = await reviewModel.create({ transaction: txn._id, reviewer: userId, reviewerRole, reviewee, ...body });
  } catch (err) {
    if (err.code === 11000) throw new ReviewError('You already reviewed this transaction', 409);
    throw err;
  }

  await notificationService.createNotification({
    recipientId: reviewee, type: NOTIFICATION_TYPES.TRANSACTION_COMPLETED, // reusing — "new review" isn't its own notification type yet, this is the closest fit
    title: 'You received a new review', message: `You were rated ${body.rating}/5`, entityType: 'transaction', entityId: txn._id,
  });
  return review;
}

// Matches the buyer Reviews.jsx page: reviews ABOUT the current user,
// written by the other party.
async function myReceivedReviews({ userId, page = 1, limit = 20 }) {
  const query = { reviewee: userId, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [rows, count] = await Promise.all([
    reviewModel.find(query).populate('reviewer', 'fullName storeName').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    reviewModel.countDocuments(query),
  ]);
  const agg = await reviewModel.aggregate([{ $match: { reviewee: new mongoose.Types.ObjectId(userId), is_deleted: deleteConstants.NOT_DELETED } }, { $group: { _id: null, average: { $avg: '$rating' } } }]);
  return {
    average: agg[0]?.average ? Number(agg[0].average.toFixed(1)) : 0,
    count,
    recent: rows.map((r) => ({ seller: r.reviewer?.storeName || r.reviewer?.fullName, rating: r.rating, comment: r.comment, date: new Date(r.createdAt).toISOString().slice(0, 10) })),
    page: pageNum, limit: pageLimit,
  };
}

module.exports = { ReviewError, submitReview, myReceivedReviews };