const mongoose = require('mongoose');
const sellerFollowModel = require('../../model/sellerFollow.model');
const userModel = require('../../model/user.model');
const materialListingModel = require('../../model/materialListing.model');
const storeProfileModel = require('../../model/storeProfile.model');
const deleteConstants = require('../../constants/delete.constants');
const userTypeConstants = require('../../constants/usertype.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class FollowError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'FollowError'; this.statusCode = statusCode; }
}

// Follower = an active buyer account. Deleted / suspended buyers keep their
// row (so the follow comes back if the account is reinstated) but are not
// counted and not notified.
const ACTIVE_BUYER = { userType: userTypeConstants.Buyer, is_deleted: deleteConstants.NOT_DELETED, status: { $ne: 'suspended' } };

const activeBuyerLookup = () => ({
  $lookup: {
    from: userModel.collection.name, let: { b: '$buyer' }, as: 'b',
    pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$b'] }, ...ACTIVE_BUYER } }, { $project: { _id: 1 } }],
  },
});

async function assertFollowableSeller(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new FollowError('Seller not found', 404);
  const seller = await userModel.findOne({ _id: sellerId, userType: userTypeConstants.Seller, is_deleted: deleteConstants.NOT_DELETED })
    .select('_id status').lean();
  if (!seller || seller.status === 'suspended') throw new FollowError('Seller not found', 404);
  return seller;
}

async function followerCount(sellerId) {
  const [row] = await sellerFollowModel.aggregate([
    { $match: { seller: new mongoose.Types.ObjectId(String(sellerId)) } },
    activeBuyerLookup(),
    { $match: { 'b.0': { $exists: true } } },
    { $count: 'n' },
  ]);
  return row?.n || 0;
}

// Only buyers reach these (route middleware); the self-follow check is a
// second line of defence in case roles ever change.
async function follow({ buyerId, sellerId, req }) {
  await assertFollowableSeller(sellerId);
  if (String(buyerId) === String(sellerId)) throw new FollowError('You cannot follow yourself', 400);
  let created = false;
  try {
    await sellerFollowModel.create({ buyer: buyerId, seller: sellerId });
    created = true;
  } catch (err) {
    if (err.code !== 11000) throw err; // already following → idempotent success
  }
  if (created) await createAuditLog({ req, userId: buyerId, action: auditLogConstants.SELLER_FOLLOWED, entity: 'users', entityId: sellerId });
  return { following: true, followerCount: await followerCount(sellerId) };
}

async function unfollow({ buyerId, sellerId, req }) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new FollowError('Seller not found', 404);
  const { deletedCount } = await sellerFollowModel.deleteOne({ buyer: buyerId, seller: sellerId });
  if (deletedCount) await createAuditLog({ req, userId: buyerId, action: auditLogConstants.SELLER_UNFOLLOWED, entity: 'users', entityId: sellerId });
  return { following: false, followerCount: await followerCount(sellerId) };
}

// Public. `viewer` is the soft-auth user (or null); only a buyer can be
// "following". `canFollow` lets the UI decide whether to show the button.
async function status({ sellerId, viewer }) {
  await assertFollowableSeller(sellerId);
  const isBuyer = viewer && viewer.userType === userTypeConstants.Buyer;
  const [count, mine] = await Promise.all([
    followerCount(sellerId),
    isBuyer ? sellerFollowModel.exists({ buyer: viewer._id, seller: sellerId }) : null,
  ]);
  return {
    followerCount: count,
    following: Boolean(mine),
    canFollow: !viewer || (isBuyer && String(viewer._id) !== String(sellerId)),
  };
}

/**
 * Tell a seller's followers about a newly published listing.
 * Called right after a listing becomes LIVE. Exactly-once per listing:
 * the `followersNotifiedAt` claim is a single conditional update, so a
 * re-approval, a pause → resume, or two admins approving at once can never
 * notify twice. Never throws — a notification failure must not undo the
 * publish that triggered it.
 */
async function notifyFollowersOfNewListing(listingId) {
  try {
    const listing = await materialListingModel.findOneAndUpdate(
      { _id: listingId, status: LISTING_STATES.LIVE, is_deleted: deleteConstants.NOT_DELETED, followersNotifiedAt: null },
      { $set: { followersNotifiedAt: new Date() } },
      { new: true }
    ).select('seller title').lean();
    if (!listing) return 0; // not public, or already announced

    const seller = await userModel.findOne({ _id: listing.seller, is_deleted: deleteConstants.NOT_DELETED, status: { $ne: 'suspended' } }).select('fullName').lean();
    if (!seller) return 0;
    const store = await storeProfileModel.findOne({ seller: listing.seller }).select('storeName').lean();
    const sellerName = store?.storeName || seller.fullName || 'A seller you follow';

    let sent = 0;
    const cursor = sellerFollowModel.aggregate([
      { $match: { seller: listing.seller } },
      activeBuyerLookup(),
      { $match: { 'b.0': { $exists: true } } },
      { $project: { buyer: 1 } },
    ]).cursor({ batchSize: 200 });
    for await (const row of cursor) {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.createNotification({
        recipientId: row.buyer,
        actorId: listing.seller,
        actorName: sellerName,
        type: NOTIFICATION_TYPES.FOLLOWED_SELLER_NEW_LISTING,
        title: `New from ${sellerName}`,
        message: `${sellerName} just listed "${listing.title}".`,
        entityType: 'listing', entityId: listing._id, entityName: listing.title,
      });
      sent += 1;
    }
    return sent;
  } catch (err) {
    console.error('Follower notification failed (non-fatal):', err.message);
    return 0;
  }
}

module.exports = { FollowError, follow, unfollow, status, followerCount, notifyFollowersOfNewListing };
