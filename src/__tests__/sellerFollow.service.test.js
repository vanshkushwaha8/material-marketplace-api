/**
 * Seller follow + "new listing from a seller you follow" notifications.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn() }));
jest.mock('../model/sellerFollow.model', () => ({ create: jest.fn(), deleteOne: jest.fn(), exists: jest.fn(), aggregate: jest.fn() }));
jest.mock('../model/user.model', () => ({ findOne: jest.fn(), collection: { name: 'users' } }));
jest.mock('../model/materialListing.model', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../model/storeProfile.model', () => ({ findOne: jest.fn() }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(null) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null), createAuditLogAdmin: jest.fn() }));

const sellerFollowModel = require('../model/sellerFollow.model');
const userModel = require('../model/user.model');
const materialListingModel = require('../model/materialListing.model');
const storeProfileModel = require('../model/storeProfile.model');
const notificationService = require('../service/app/notification.service');
const followService = require('../service/app/sellerFollow.service');

const BUYER = '64b000000000000000000002';
const SELLER = '64b000000000000000000003';
const LISTING = '64b000000000000000000009';
const lean = (v) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });

function asyncIter(rows) {
  return { async *[Symbol.asyncIterator]() { yield* rows; } };
}

beforeEach(() => {
  jest.clearAllMocks();
  userModel.findOne.mockReturnValue(lean({ _id: SELLER, status: 'approved', fullName: 'Sam Seller' }));
  sellerFollowModel.aggregate.mockResolvedValue([{ n: 7 }]);
});

describe('follow / unfollow', () => {
  test('follow creates one row and returns the live count', async () => {
    sellerFollowModel.create.mockResolvedValue({});
    await expect(followService.follow({ buyerId: BUYER, sellerId: SELLER })).resolves.toEqual({ following: true, followerCount: 7 });
    expect(sellerFollowModel.create).toHaveBeenCalledWith({ buyer: BUYER, seller: SELLER });
  });

  test('following twice is idempotent (unique index hit is not an error)', async () => {
    sellerFollowModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    await expect(followService.follow({ buyerId: BUYER, sellerId: SELLER })).resolves.toMatchObject({ following: true });
  });

  test('cannot follow yourself', async () => {
    await expect(followService.follow({ buyerId: SELLER, sellerId: SELLER })).rejects.toMatchObject({ statusCode: 400 });
    expect(sellerFollowModel.create).not.toHaveBeenCalled();
  });

  test.each([[null], [{ _id: SELLER, status: 'suspended' }]])('unknown / suspended seller → 404 (%p)', async (seller) => {
    userModel.findOne.mockReturnValue(lean(seller));
    await expect(followService.follow({ buyerId: BUYER, sellerId: SELLER })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('invalid id → 404 without touching the DB', async () => {
    await expect(followService.follow({ buyerId: BUYER, sellerId: 'nope' })).rejects.toMatchObject({ statusCode: 404 });
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  test('unfollow removes only the caller’s row', async () => {
    sellerFollowModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    await expect(followService.unfollow({ buyerId: BUYER, sellerId: SELLER })).resolves.toMatchObject({ following: false });
    expect(sellerFollowModel.deleteOne).toHaveBeenCalledWith({ buyer: BUYER, seller: SELLER });
  });

  test('status: seller viewing own page cannot follow; anonymous can (prompted to log in)', async () => {
    sellerFollowModel.exists.mockResolvedValue(null);
    expect(await followService.status({ sellerId: SELLER, viewer: { _id: SELLER, userType: 'Seller' } })).toMatchObject({ canFollow: false, following: false });
    expect(await followService.status({ sellerId: SELLER, viewer: null })).toMatchObject({ canFollow: true, followerCount: 7 });
  });
});

describe('notifyFollowersOfNewListing', () => {
  test('notifies each active follower once with a listing deep link', async () => {
    materialListingModel.findOneAndUpdate.mockReturnValue(lean({ _id: LISTING, seller: SELLER, title: 'TMT bars' }));
    storeProfileModel.findOne.mockReturnValue(lean({ storeName: 'Sam Steel' }));
    sellerFollowModel.aggregate.mockReturnValue({ cursor: () => asyncIter([{ buyer: 'b1' }, { buyer: 'b2' }]) });

    await expect(followService.notifyFollowersOfNewListing(LISTING)).resolves.toBe(2);
    const claim = materialListingModel.findOneAndUpdate.mock.calls[0][0];
    expect(claim).toMatchObject({ _id: LISTING, status: 'LIVE', followersNotifiedAt: null });
    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'b1', type: 'FOLLOWED_SELLER_NEW_LISTING', entityType: 'listing', entityId: LISTING,
    }));
  });

  test('already announced / not public → nobody is notified again', async () => {
    materialListingModel.findOneAndUpdate.mockReturnValue(lean(null));
    await expect(followService.notifyFollowersOfNewListing(LISTING)).resolves.toBe(0);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('never throws into the publish flow', async () => {
    materialListingModel.findOneAndUpdate.mockImplementation(() => { throw new Error('db down'); });
    await expect(followService.notifyFollowersOfNewListing(LISTING)).resolves.toBe(0);
  });
});
