const mongoose = require('mongoose');
const reviewModel = require('../../model/review.model');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../../constants/review.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const cache = require('../../helper/cache.helper');

class AdminReviewError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'AdminReviewError'; this.statusCode = statusCode; }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toId = (id) => new mongoose.Types.ObjectId(String(id));
const VISIBLE = { $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] };

// Reviews written before `status` existed have no field — they are ACTIVE.
const normalize = (r) => ({ ...r, status: r.status || REVIEW_STATUS.ACTIVE });

// Admins see and moderate seller ratings (buyer → seller). They never
// create ratings or change who wrote/received them — moderation only flips
// visibility, and every flip is audited. Public averages are computed on
// read from visible ratings, so hiding/restoring takes effect everywhere
// immediately (no cached counters to drift).
async function list({ page = 1, limit = 20, search, status, rating, sellerId, buyerId, from, to, sort = 'newest' }) {
  const query = { reviewerRole: REVIEWER_ROLES.BUYER, is_deleted: deleteConstants.NOT_DELETED };
  if (status === REVIEW_STATUS.ACTIVE) query.status = VISIBLE;
  else if (status) query.status = status;
  if (rating) query.rating = rating;
  if (sellerId) query.reviewee = toId(sellerId);
  if (buyerId) query.reviewer = toId(buyerId);
  if (from || to) query.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const users = await userModel.find({ $or: [{ fullName: rx }, { email: rx }, { storeName: rx }] }).select('_id').limit(500).lean();
    const ids = users.map((u) => u._id);
    query.$or = [{ comment: rx }, { reviewer: { $in: ids } }, { reviewee: { $in: ids } }];
  }

  const sortBy = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, lowest: { rating: 1, createdAt: -1 }, highest: { rating: -1, createdAt: -1 } }[sort];
  const pageNum = Math.max(1, page);
  const [getData, count, statusCounts] = await Promise.all([
    reviewModel.find(query)
      .populate('reviewer', 'fullName email')
      .populate('reviewee', 'fullName email storeName')
      .populate({ path: 'transaction', select: 'listing agreedAmount status completedAt', populate: { path: 'listing', select: 'title' } })
      .populate('moderation.by', 'fullName email')
      .sort(sortBy).skip((pageNum - 1) * limit).limit(limit).lean(),
    reviewModel.countDocuments(query),
    reviewModel.aggregate([
      { $match: { reviewerRole: REVIEWER_ROLES.BUYER, is_deleted: deleteConstants.NOT_DELETED } },
      { $group: { _id: { $ifNull: ['$status', REVIEW_STATUS.ACTIVE] }, n: { $sum: 1 } } },
    ]),
  ]);
  const counts = { ACTIVE: 0, HIDDEN: 0, INVALIDATED: 0 };
  statusCounts.forEach((r) => { counts[r._id] = r.n; });
  return { getData: getData.map(normalize), count, counts, page: pageNum, limit };
}

async function getOne(reviewId) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) throw new AdminReviewError('Rating not found', 404);
  const review = await reviewModel.findOne({ _id: reviewId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('reviewer', 'fullName email userType status')
    .populate('reviewee', 'fullName email storeName userType status')
    .populate({ path: 'transaction', select: 'listing agreedQuantity agreedAmount status completedAt disputed', populate: { path: 'listing', select: 'title unit' } })
    .populate('moderation.by', 'fullName email')
    .lean();
  if (!review) throw new AdminReviewError('Rating not found', 404);
  return normalize(review);
}

// action: 'hide' | 'restore'. Conditional update, so two admins acting at
// once can't both "win"; INVALIDATED (refunded order) can't be restored by hand.
async function moderate({ reviewId, action, reason, adminId, req }) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) throw new AdminReviewError('Rating not found', 404);
  const hide = action === 'hide';
  const updated = await reviewModel.findOneAndUpdate(
    { _id: reviewId, is_deleted: deleteConstants.NOT_DELETED, status: hide ? VISIBLE : REVIEW_STATUS.HIDDEN },
    { $set: { status: hide ? REVIEW_STATUS.HIDDEN : REVIEW_STATUS.ACTIVE, moderation: { by: adminId, reason: reason || '', at: new Date() } } },
    { new: true }
  ).lean();

  if (!updated) {
    const existing = await reviewModel.findOne({ _id: reviewId, is_deleted: deleteConstants.NOT_DELETED }).select('status').lean();
    if (!existing) throw new AdminReviewError('Rating not found', 404);
    if (existing.status === REVIEW_STATUS.INVALIDATED) throw new AdminReviewError('This rating belongs to a refunded order and cannot be changed', 409);
    throw new AdminReviewError(hide ? 'This rating is already hidden' : 'This rating is already visible', 409);
  }

  // Public averages must reflect the moderation immediately.
  await cache.del(cache.NAMESPACES.SELLER_RATING, String(updated.reviewee));
  await createAuditLogAdmin({
    req, adminId,
    action: hide ? auditLogConstants.ADMIN_REVIEW_HIDDEN : auditLogConstants.ADMIN_REVIEW_RESTORED,
    entity: 'reviews', entityId: updated._id,
    fromState: hide ? REVIEW_STATUS.ACTIVE : REVIEW_STATUS.HIDDEN,
    toState: updated.status,
    reason,
    metadata: { sellerId: updated.reviewee, buyerId: updated.reviewer, transactionId: updated.transaction, rating: updated.rating },
  });
  return getOne(updated._id);
}

module.exports = { AdminReviewError, list, getOne, moderate };
