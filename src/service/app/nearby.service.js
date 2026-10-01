const mongoose = require('mongoose');
const userModel = require('../../model/user.model');
const storeProfileModel = require('../../model/storeProfile.model');
const materialListingModel = require('../../model/materialListing.model');
const reviewModel = require('../../model/review.model');
const deleteConstants = require('../../constants/delete.constants');
const userTypeConstants = require('../../constants/usertype.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { REVIEWER_ROLES, REVIEW_STATUS } = require('../../constants/review.constants');

// Nearby seller / store discovery (buyer "Near Me").
//
// Distance is ALWAYS computed here, from the stored GeoJSON points, with
// MongoDB's $geoNear on the existing 2dsphere indexes:
//   - INDIVIDUAL sellers -> users.location.geo
//   - BUSINESS_STORE     -> store_profiles.location.geo (the store's own
//                           location, not the owner's personal one)
// Never from city names or pincodes, and never trusting a client distance.
//
// Privacy: responses never include coordinates or a street address. An
// individual seller's point is usually their home, so their distance is
// additionally coarsened (rounded UP to the next 0.5 km) — enough to rank
// and filter by, not enough to triangulate a house.

const INDIVIDUAL_DISTANCE_STEP_KM = 0.5;

function roundStoreKm(meters) {
  return Math.round((meters / 1000) * 10) / 10;
}

function coarsenIndividualKm(meters) {
  const km = meters / 1000;
  return Math.max(INDIVIDUAL_DISTANCE_STEP_KM, Math.ceil(km / INDIVIDUAL_DISTANCE_STEP_KM) * INDIVIDUAL_DISTANCE_STEP_KM);
}

// Shared tail for both pipelines: live-listing count (optionally within a
// category), buyer->seller rating, and the "must actually have something to
// sell" filter. `sellerIdPath` is where the seller's user _id lives on the
// current document ('$_id' for users, '$seller' for store profiles).
function sellerStatsStages({ sellerIdPath, categoryId, minRating }) {
  const listingMatch = {
    $expr: { $eq: ['$seller', '$$sid'] },
    status: LISTING_STATES.LIVE,
    is_deleted: deleteConstants.NOT_DELETED,
  };
  if (categoryId) listingMatch.category = categoryId;

  const stages = [
    {
      $lookup: {
        from: materialListingModel.collection.name,
        let: { sid: sellerIdPath },
        pipeline: [{ $match: listingMatch }, { $count: 'n' }],
        as: 'liveListings',
      },
    },
    { $addFields: { liveListingCount: { $ifNull: [{ $first: '$liveListings.n' }, 0] } } },
    { $match: { liveListingCount: { $gt: 0 } } },
    {
      $lookup: {
        from: reviewModel.collection.name,
        let: { sid: sellerIdPath },
        pipeline: [
          { $match: { $expr: { $eq: ['$reviewee', '$$sid'] }, reviewerRole: REVIEWER_ROLES.BUYER, status: { $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] }, is_deleted: deleteConstants.NOT_DELETED } },
          { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
        ],
        as: 'ratingAgg',
      },
    },
    {
      $addFields: {
        ratingAverage: { $ifNull: [{ $first: '$ratingAgg.avg' }, null] },
        ratingCount: { $ifNull: [{ $first: '$ratingAgg.count' }, 0] },
      },
    },
  ];
  if (minRating) stages.push({ $match: { ratingAverage: { $gte: Number(minRating) } } });
  return stages;
}

async function findIndividualSellers({ point, maxDistance, categoryId, minRating, fetchLimit }) {
  const rows = await userModel.aggregate([
    {
      $geoNear: {
        near: point,
        key: 'location.geo',
        distanceField: 'distanceMeters',
        maxDistance,
        spherical: true,
        query: {
          userType: userTypeConstants.Seller,
          // Legacy sellers with no sellerType are INDIVIDUAL by convention
          // (see materialListing.service.js#resolveSupplyType).
          sellerType: { $in: [SELLER_TYPES.INDIVIDUAL, null] },
          status: { $ne: 'suspended' },
          isEmailVerified: true,
          is_deleted: deleteConstants.NOT_DELETED,
        },
      },
    },
    ...sellerStatsStages({ sellerIdPath: '$_id', categoryId, minRating }),
    { $limit: fetchLimit },
    { $project: { fullName: 1, profilePicture: 1, createdAt: 1, 'location.city': 1, 'location.state': 1, 'location.area': 1, distanceMeters: 1, liveListingCount: 1, ratingAverage: 1, ratingCount: 1 } },
  ]);

  return rows.map((u) => ({
    sellerId: u._id,
    sellerType: SELLER_TYPES.INDIVIDUAL,
    // First name only for individuals — a full personal name next to a
    // distance is more than a buyer needs before contacting via an offer.
    displayName: (u.fullName || 'Individual seller').trim().split(/\s+/)[0],
    profileImage: u.profilePicture || '',
    location: { city: u.location?.city || '', state: u.location?.state || '', area: u.location?.area || '' },
    distanceKm: coarsenIndividualKm(u.distanceMeters),
    distanceApproximate: true,
    sortMeters: u.distanceMeters,
    liveListingCount: u.liveListingCount,
    rating: u.ratingAverage != null ? Math.round(u.ratingAverage * 10) / 10 : null,
    ratingCount: u.ratingCount,
    verified: false, // no individual-seller verification exists yet — never implied
    memberSince: u.createdAt,
  }));
}

async function findStores({ point, maxDistance, categoryId, minRating, fetchLimit }) {
  const storeQuery = { is_deleted: deleteConstants.NOT_DELETED };
  if (categoryId) storeQuery.categoryIds = categoryId;

  const rows = await storeProfileModel.aggregate([
    {
      $geoNear: {
        near: point,
        key: 'location.geo',
        distanceField: 'distanceMeters',
        maxDistance,
        spherical: true,
        query: storeQuery,
      },
    },
    // The owning account must still be an active BUSINESS_STORE seller.
    {
      $lookup: {
        from: userModel.collection.name,
        // let/pipeline form (not localField+pipeline, which needs MongoDB 5+).
        let: { ownerId: '$seller' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$ownerId'] } } },
          { $project: { sellerType: 1, status: 1, is_deleted: 1, isEmailVerified: 1 } },
        ],
        as: 'owner',
      },
    },
    { $unwind: '$owner' },
    {
      $match: {
        'owner.sellerType': SELLER_TYPES.BUSINESS_STORE,
        'owner.status': { $ne: 'suspended' },
        'owner.is_deleted': deleteConstants.NOT_DELETED,
        'owner.isEmailVerified': true,
      },
    },
    ...sellerStatsStages({ sellerIdPath: '$seller', categoryId, minRating }),
    { $limit: fetchLimit },
    {
      $project: {
        seller: 1, storeName: 1, profileImage: 1, verificationStatus: 1, pickupAvailable: 1, deliveryAvailable: 1, categories: 1,
        'location.city': 1, 'location.state': 1, 'location.area': 1, distanceMeters: 1, liveListingCount: 1, ratingAverage: 1, ratingCount: 1,
      },
    },
  ]);

  return rows.map((s) => ({
    sellerId: s.seller,
    sellerType: SELLER_TYPES.BUSINESS_STORE,
    displayName: s.storeName,
    profileImage: s.profileImage ? `/images/${s.profileImage}` : '',
    location: { city: s.location?.city || '', state: s.location?.state || '', area: s.location?.area || '' },
    distanceKm: roundStoreKm(s.distanceMeters),
    distanceApproximate: false,
    sortMeters: s.distanceMeters,
    liveListingCount: s.liveListingCount,
    rating: s.ratingAverage != null ? Math.round(s.ratingAverage * 10) / 10 : null,
    ratingCount: s.ratingCount,
    verified: s.verificationStatus === 'VERIFIED',
    pickupAvailable: Boolean(s.pickupAvailable),
    deliveryAvailable: Boolean(s.deliveryAvailable),
    categories: s.categories || [],
  }));
}

/**
 * @param {object} p - already Joi-validated (nearby.validation.js)
 * @returns {{ getData: object[], page: number, limit: number, hasMore: boolean, radiusKm: number }}
 */
async function nearbySellers({ lat, lng, radiusKm, sellerType, category, minRating, page = 1, limit = 20 }) {
  const point = { type: 'Point', coordinates: [Number(lng), Number(lat)] }; // GeoJSON: [lng, lat]
  const maxDistance = Number(radiusKm) * 1000;
  const categoryId = category ? new mongoose.Types.ObjectId(category) : null;
  const skip = (page - 1) * limit;
  // Each source is already nearest-first; fetching skip+limit+1 from each is
  // enough to merge the requested window exactly and know if more exist.
  const fetchLimit = skip + limit + 1;
  const args = { point, maxDistance, categoryId, minRating, fetchLimit };

  const [individuals, stores] = await Promise.all([
    sellerType === SELLER_TYPES.BUSINESS_STORE ? [] : findIndividualSellers(args),
    sellerType === SELLER_TYPES.INDIVIDUAL ? [] : findStores(args),
  ]);

  const merged = [...individuals, ...stores].sort((a, b) => a.sortMeters - b.sortMeters);
  const window = merged.slice(skip, skip + limit).map(({ sortMeters, ...row }) => row);
  return { getData: window, page, limit, hasMore: merged.length > skip + limit, radiusKm: Number(radiusKm) };
}

module.exports = { nearbySellers, coarsenIndividualKm, roundStoreKm };
