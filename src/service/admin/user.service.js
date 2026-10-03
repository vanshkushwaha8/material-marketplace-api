require('../../model/admin.model'); // registers `admins` for the populate() of admin refs below
const mongoose = require('mongoose');
const userModel = require('../../model/user.model');
const storeProfileModel = require('../../model/storeProfile.model');
const materialListingModel = require('../../model/materialListing.model');
const offerModel = require('../../model/offer.model');
const transactionModel = require('../../model/transaction.model');
const paymentModel = require('../../model/payment.model');
const payoutModel = require('../../model/payout.model');
const reviewModel = require('../../model/review.model');
const deliveryLocationModel = require('../../model/deliveryLocation.model');
const sessionModel = require('../../model/session.model');
const auditLogModel = require('../../model/auditLogs.model');
const deleteConstants = require('../../constants/delete.constants');
const userTypeConstants = require('../../constants/usertype.constants');
const auditLogConstants = require('../../constants/auditLogConstants');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../../constants/review.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const payoutService = require('../app/payout.service');

class AdminUserError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'AdminUserError'; this.statusCode = statusCode; }
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function paging({ page = 1, limit = 20 }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  return { pageNum, pageLimit, skip: (pageNum - 1) * pageLimit };
}

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AdminUserError('Invalid user id', 404);
  return new mongoose.Types.ObjectId(id);
}

async function getUserOrThrow(userId) {
  const _id = toObjectId(userId);
  const user = await userModel.findOne({ _id }).select('-password -fcmTokens').lean();
  if (!user) throw new AdminUserError('User not found', 404);
  return user;
}

// Only fields an operator needs in the list — detail comes from getOne.
const LIST_PROJECTION = 'fullName email countryCode phoneNumber userType sellerType buyerType storeName status isEmailVerified location.city location.state createdAt inactivityDate is_deleted';

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { fullName: 1 },
  // inactivityDate is bumped on every authenticated request
  // (auth.middleware.js) — the closest thing to "last activity" stored.
  last_active: { inactivityDate: -1 },
};

async function list(filters) {
  const { search, userType, sellerType, status, emailVerified, city, state, from, to, sort = 'newest', includeDeleted } = filters;
  const { pageNum, pageLimit, skip } = paging(filters);

  const query = {};
  if (!includeDeleted) query.is_deleted = deleteConstants.NOT_DELETED;
  // Only the marketplace roles are listed here (admins live in `admins`).
  query.userType = userType || { $in: [userTypeConstants.Buyer, userTypeConstants.Seller] };
  if (sellerType) query.sellerType = sellerType;
  if (status) query.status = status;
  if (emailVerified !== undefined) query.isEmailVerified = emailVerified;
  if (city) query['location.city'] = { $regex: `^${escapeRegex(city)}$`, $options: 'i' };
  if (state) query['location.state'] = { $regex: `^${escapeRegex(state)}$`, $options: 'i' };
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const or = [{ fullName: rx }, { email: rx }, { phoneNumber: rx }, { storeName: rx }];
    if (mongoose.Types.ObjectId.isValid(search)) or.push({ _id: new mongoose.Types.ObjectId(search) });
    query.$or = or;
  }

  const [getData, count] = await Promise.all([
    userModel.find(query).select(LIST_PROJECTION).sort(SORTS[sort] || SORTS.newest).skip(skip).limit(pageLimit).lean(),
    userModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function countBy(model, match, field) {
  const rows = await model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return rows.reduce((acc, r) => ({ ...acc, [r._id || 'UNKNOWN']: r.n }), {});
}

async function getOne({ userId, adminId, req }) {
  const user = await getUserOrThrow(userId);
  const _id = user._id;
  const notDeleted = { is_deleted: deleteConstants.NOT_DELETED };
  const isSeller = user.userType === userTypeConstants.Seller;

  const [
    storeProfile, listingsByStatus, offersAsBuyer, offersAsSeller, txnAsBuyer, txnAsSeller,
    ratingReceived, reviewsGiven, deliveryLocations, activeSessions, payoutReadiness,
  ] = await Promise.all([
    isSeller ? storeProfileModel.findOne({ seller: _id }).populate('businessType', 'name').lean() : null,
    isSeller ? countBy(materialListingModel, { seller: _id, ...notDeleted }, 'status') : {},
    countBy(offerModel, { buyer: _id, ...notDeleted }, 'status'),
    isSeller ? countBy(offerModel, { seller: _id, ...notDeleted }, 'status') : {},
    countBy(transactionModel, { buyer: _id, ...notDeleted }, 'status'),
    isSeller ? countBy(transactionModel, { seller: _id, ...notDeleted }, 'status') : {},
    reviewModel.aggregate([
      { $match: { reviewee: _id, reviewerRole: isSeller ? REVIEWER_ROLES.BUYER : REVIEWER_ROLES.SELLER, status: { $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] }, ...notDeleted } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    reviewModel.countDocuments({ reviewer: _id, ...notDeleted }),
    deliveryLocationModel.countDocuments({ buyer: _id, ...notDeleted }),
    sessionModel.countDocuments({ userId: _id, expireOn: { $gt: new Date() } }),
    isSeller ? payoutService.getPayoutReadiness(_id) : null,
  ]);

  // Reading a user's full profile (PII, coordinates, bank summary) is itself
  // a sensitive admin action — recorded like any other.
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.ADMIN_USER_DETAIL_VIEWED, entity: 'users', entityId: _id });

  const coords = user.location?.geo?.coordinates;
  return {
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      countryCode: user.countryCode,
      phoneNumber: user.phoneNumber,
      userType: user.userType,
      sellerType: user.sellerType || null,
      buyerType: user.buyerType || null,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      mfaEnabled: user.mfaEnabled,
      isDeleted: user.is_deleted === deleteConstants.DELETED,
      lockUntil: user.lockUntil,
      failedLoginAttempts: user.failedLoginAttempts,
      profilePicture: user.profilePicture || '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastActivityAt: user.inactivityDate || null,
      activeSessions,
    },
    // Admin-only view: exact coordinates are shown here (they are never
    // exposed on public endpoints).
    location: user.location ? {
      city: user.location.city, state: user.location.state, pincode: user.location.pincode, area: user.location.area,
      latitude: coords ? coords[1] : null, longitude: coords ? coords[0] : null,
      updatedAt: user.locationUpdatedAt || null,
    } : null,
    storeProfile: storeProfile ? {
      _id: storeProfile._id,
      storeName: storeProfile.storeName,
      businessType: storeProfile.businessType?.name || null,
      address: storeProfile.address,
      location: {
        city: storeProfile.location?.city, state: storeProfile.location?.state, pincode: storeProfile.location?.pincode, area: storeProfile.location?.area,
        latitude: storeProfile.location?.geo?.coordinates?.[1] ?? null, longitude: storeProfile.location?.geo?.coordinates?.[0] ?? null,
      },
      categories: storeProfile.categories,
      pickupAvailable: storeProfile.pickupAvailable,
      deliveryAvailable: storeProfile.deliveryAvailable,
      panNumber: storeProfile.panNumber,
      gstRegistered: storeProfile.gstRegistered,
      gstin: storeProfile.gstin,
      verificationStatus: storeProfile.verificationStatus,
      verificationNote: storeProfile.verificationNote,
      history: storeProfile.history,
      createdAt: storeProfile.createdAt,
    } : null,
    payout: payoutReadiness,
    stats: {
      listingsByStatus,
      offersAsBuyer,
      offersAsSeller,
      transactionsAsBuyer: txnAsBuyer,
      transactionsAsSeller: txnAsSeller,
      rating: ratingReceived[0] ? { average: Math.round(ratingReceived[0].avg * 10) / 10, count: ratingReceived[0].count } : { average: null, count: 0 },
      reviewsGiven,
      savedListings: (user.savedListingIds || []).length,
      deliveryLocations,
    },
  };
}

async function listings({ userId, status, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { seller: _id, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const [getData, count] = await Promise.all([
    materialListingModel.find(query)
      .select('title status verificationStatus price unit quantity availableQuantity reservedQuantity soldQuantity location.city createdAt updatedAt images')
      .populate('category', 'name')
      .sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function offers({ userId, role = 'buyer', status, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { [role === 'seller' ? 'seller' : 'buyer']: _id, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const [getData, count] = await Promise.all([
    offerModel.find(query)
      .populate('listing', 'title unit price')
      .populate(role === 'seller' ? 'buyer' : 'seller', 'fullName email')
      .sort({ updatedAt: -1 }).skip(skip).limit(pageLimit).lean(),
    offerModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function transactions({ userId, role = 'buyer', status, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { [role === 'seller' ? 'seller' : 'buyer']: _id, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const [getData, count] = await Promise.all([
    transactionModel.find(query)
      .select('-handoverEvidence')
      .populate('listing', 'title unit')
      .populate(role === 'seller' ? 'buyer' : 'seller', 'fullName email')
      .sort({ updatedAt: -1 }).skip(skip).limit(pageLimit).lean(),
    transactionModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function payments({ userId, role = 'buyer', status, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { [role === 'seller' ? 'seller' : 'buyer']: _id, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const [getData, count] = await Promise.all([
    paymentModel.find(query)
      .select('transaction provider providerOrderId providerPaymentId amountPaise currency method status failureReason refunds reconciliationRequired reconciliationReason createdAt updatedAt')
      .sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    paymentModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function payouts({ userId, status, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { seller: _id, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const [getData, count] = await Promise.all([
    payoutModel.find(query)
      .populate({ path: 'transaction', select: 'listing agreedQuantity status', populate: { path: 'listing', select: 'title unit' } })
      .sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    payoutModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function reviews({ userId, direction = 'received', ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { [direction === 'given' ? 'reviewer' : 'reviewee']: _id, is_deleted: deleteConstants.NOT_DELETED };
  const [getData, count] = await Promise.all([
    reviewModel.find(query)
      .populate(direction === 'given' ? 'reviewee' : 'reviewer', 'fullName')
      .sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    reviewModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

// Everything the append-only audit log recorded about this user: their own
// actions (userId) plus admin actions targeting them (entity users/_id).
async function history({ userId, action, ...rest }) {
  const _id = toObjectId(userId);
  const { pageNum, pageLimit, skip } = paging(rest);
  const query = { $or: [{ userId: _id }, { entity: 'users', entityId: _id }] };
  if (action) query.action = action;
  const [rows, count] = await Promise.all([
    auditLogModel.find(query)
      .select('action entity entityId fromState toState reason metadata ip userAgent adminId userId createdAt')
      .populate('adminId', 'fullName email')
      .sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    auditLogModel.countDocuments(query),
  ]);
  const getData = rows.map((r) => ({
    _id: r._id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    fromState: r.fromState,
    toState: r.toState,
    reason: r.reason,
    metadata: r.metadata,
    ip: r.ip,
    actor: r.adminId ? { type: 'admin', name: r.adminId.fullName || r.adminId.email || 'Admin' } : { type: 'user' },
    createdAt: r.createdAt,
  }));
  return { getData, count, page: pageNum, limit: pageLimit };
}

const ADMIN_STATUS_TARGETS = { suspended: 'suspended', approved: 'approved' };

async function updateStatus({ userId, status, reason, adminId, req }) {
  if (!ADMIN_STATUS_TARGETS[status]) throw new AdminUserError('status must be "suspended" or "approved"');
  const user = await getUserOrThrow(userId);
  if (user.is_deleted === deleteConstants.DELETED) throw new AdminUserError('This account has been deleted', 409);
  if (user.status === status) throw new AdminUserError(`Account is already ${status}`, 409);

  await userModel.updateOne({ _id: user._id }, { $set: { status } });
  if (status === 'suspended') {
    // Suspension must take effect immediately, not at the next token expiry.
    await sessionModel.deleteMany({ userId: user._id });
  }
  await createAuditLogAdmin({
    req, adminId,
    action: status === 'suspended' ? auditLogConstants.ADMIN_USER_SUSPENDED : auditLogConstants.ADMIN_USER_REACTIVATED,
    entity: 'users', entityId: user._id,
    fromState: user.status, toState: status, reason,
  });
  return { _id: user._id, status };
}

const cacheHelper = require('../../helper/cache.helper');
const updateStatusAndInvalidate = async (args) => {
  const result = await updateStatus(args);
  await cacheHelper.del(cacheHelper.NAMESPACES.STORE, String(args.userId));
  return result;
};

module.exports = {
  AdminUserError, list, getOne, listings, offers, transactions, payments, payouts, reviews, history, updateStatus: updateStatusAndInvalidate,
};
