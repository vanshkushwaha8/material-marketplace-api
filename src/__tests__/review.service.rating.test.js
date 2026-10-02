/**
 * Seller rating rules (review.service):
 *  - only a party to a COMPLETED, non-disputed order can rate;
 *    role + counterparty come from the order, never the request body;
 *  - one rating per order per direction (duplicate → 409);
 *  - only the author can edit, and only rating/comment;
 *  - hidden / invalidated ratings are locked and excluded from stats.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn() }));
jest.mock('../model/review.model', () => ({ create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn(), updateMany: jest.fn(), find: jest.fn() }));
jest.mock('../helper/cache.helper', () => ({
  NAMESPACES: { SELLER_RATING: 'seller-rating' },
  // Cache disabled in tests: always load.
  getManyOrSet: jest.fn((ns, ids, ttl, load) => load(ids)),
  del: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../model/transaction.model', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../model/user.model', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(null) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null), createAuditLogAdmin: jest.fn() }));

const reviewModel = require('../model/review.model');
const transactionModel = require('../model/transaction.model');
const { TRANSACTION_STATES } = require('../constants/transaction.constants');
const { REVIEW_STATUS } = require('../constants/review.constants');
const reviewService = require('../service/app/review.service');
const reviewValidation = require('../validation/app/review.validation');

const TXN = '64b000000000000000000001';
const BUYER = '64b000000000000000000002';
const SELLER = '64b000000000000000000003';
const STRANGER = '64b000000000000000000004';
const REVIEW = '64b000000000000000000005';

const txn = (o = {}) => ({ _id: TXN, buyer: BUYER, seller: SELLER, status: TRANSACTION_STATES.COMPLETED, disputed: false, ...o });
const leanTxn = (o) => ({ select: () => ({ lean: () => Promise.resolve(o) }) });

beforeEach(() => {
  jest.clearAllMocks();
  reviewModel.create.mockImplementation(async (doc) => ({ _id: REVIEW, ...doc }));
});

describe('submitReview eligibility', () => {
  test('buyer on a completed order rates the seller; ownership comes from the order', async () => {
    transactionModel.findOne.mockResolvedValue(txn());
    await reviewService.submitReview({ transactionId: TXN, userId: BUYER, body: { rating: 5, comment: 'Great' } });
    expect(reviewModel.create).toHaveBeenCalledWith(expect.objectContaining({
      transaction: TXN, reviewer: BUYER, reviewee: SELLER, reviewerRole: 'buyer', rating: 5, status: REVIEW_STATUS.ACTIVE,
    }));
  });

  test.each([
    TRANSACTION_STATES.PAYMENT_PENDING, TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.REFUNDED,
  ])('order in %s cannot be rated', async (status) => {
    transactionModel.findOne.mockResolvedValue(txn({ status }));
    await expect(reviewService.submitReview({ transactionId: TXN, userId: BUYER, body: { rating: 4 } }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(reviewModel.create).not.toHaveBeenCalled();
  });

  test('disputed order cannot be rated', async () => {
    transactionModel.findOne.mockResolvedValue(txn({ disputed: true }));
    await expect(reviewService.submitReview({ transactionId: TXN, userId: BUYER, body: { rating: 4 } })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('someone not on the order is rejected', async () => {
    transactionModel.findOne.mockResolvedValue(txn());
    await expect(reviewService.submitReview({ transactionId: TXN, userId: STRANGER, body: { rating: 4 } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('seller cannot rate themselves (buyer == seller)', async () => {
    transactionModel.findOne.mockResolvedValue(txn({ seller: BUYER }));
    await expect(reviewService.submitReview({ transactionId: TXN, userId: BUYER, body: { rating: 5 } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('second rating for the same order → 409 (unique index)', async () => {
    transactionModel.findOne.mockResolvedValue(txn());
    reviewModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    await expect(reviewService.submitReview({ transactionId: TXN, userId: BUYER, body: { rating: 3 } }))
      .rejects.toMatchObject({ statusCode: 409, errorCode: 'REVIEW_EXISTS' });
  });
});

describe('validation', () => {
  test.each([0, 6, 2.5, 'x', undefined])('rejects rating %p', (rating) => {
    expect(reviewValidation.ValidateCreate({ rating }).error).toBeTruthy();
  });
  test('strips client-supplied ownership fields', () => {
    const { value, error } = reviewValidation.ValidateCreate({ rating: 4, buyerId: STRANGER, sellerId: STRANGER, orderId: TXN, reviewer: STRANGER });
    expect(error).toBeUndefined();
    expect(value).toEqual({ rating: 4 });
  });
});

describe('updateMyReview', () => {
  const doc = (o = {}) => ({ _id: REVIEW, reviewer: BUYER, reviewee: SELLER, transaction: TXN, rating: 2, comment: 'meh', status: REVIEW_STATUS.ACTIVE, save: jest.fn().mockResolvedValue(null), ...o });

  test('author can change rating + comment only', async () => {
    const r = doc();
    reviewModel.findOne.mockResolvedValue(r);
    transactionModel.findById.mockReturnValue(leanTxn(txn()));
    await reviewService.updateMyReview({ reviewId: REVIEW, userId: BUYER, body: { rating: 4, comment: 'better' } });
    expect(r.rating).toBe(4);
    expect(r.comment).toBe('better');
    expect(r.reviewee).toBe(SELLER);
    expect(r.editedAt).toBeInstanceOf(Date);
    expect(r.save).toHaveBeenCalled();
  });

  test("another user's review looks like it doesn't exist", async () => {
    reviewModel.findOne.mockResolvedValue(doc());
    await expect(reviewService.updateMyReview({ reviewId: REVIEW, userId: STRANGER, body: { rating: 1 } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test.each([REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED])('%s review is locked', async (status) => {
    reviewModel.findOne.mockResolvedValue(doc({ status }));
    await expect(reviewService.updateMyReview({ reviewId: REVIEW, userId: BUYER, body: { rating: 5 } })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('order refunded after rating → cannot edit', async () => {
    reviewModel.findOne.mockResolvedValue(doc());
    transactionModel.findById.mockReturnValue(leanTxn(txn({ status: TRANSACTION_STATES.REFUNDED })));
    await expect(reviewService.updateMyReview({ reviewId: REVIEW, userId: BUYER, body: { rating: 5 } })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('rating stats', () => {
  test('only visible buyer→seller reviews are aggregated', async () => {
    reviewModel.aggregate.mockResolvedValue([
      { _id: { seller: SELLER, rating: 5 }, n: 3 },
      { _id: { seller: SELLER, rating: 2 }, n: 1 },
    ]);
    const summary = await reviewService.sellerRatingSummary(SELLER);
    const match = reviewModel.aggregate.mock.calls[0][0][0].$match;
    expect(match.reviewerRole).toBe('buyer');
    expect(match.status).toEqual({ $nin: [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.INVALIDATED] });
    expect(summary).toEqual({ average: 4.3, count: 4, distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 3 } });
  });

  test('no ratings → null average, zero count', async () => {
    reviewModel.aggregate.mockResolvedValue([]);
    expect(await reviewService.sellerRatingSummary(SELLER)).toMatchObject({ average: null, count: 0 });
  });

  test('refund invalidates the order’s ratings and drops the seller’s cached summary', async () => {
    reviewModel.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ reviewee: SELLER }]) }) });
    await reviewService.invalidateForTransaction(TXN, 'Order refunded');
    expect(require('../helper/cache.helper').del).toHaveBeenCalledWith('seller-rating', SELLER);
    expect(reviewModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: TXN }),
      { $set: expect.objectContaining({ status: REVIEW_STATUS.INVALIDATED }) }
    );
  });
});
