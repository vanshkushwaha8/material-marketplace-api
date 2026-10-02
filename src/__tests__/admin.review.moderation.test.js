/**
 * Admin rating moderation: visibility only, audited, race-safe.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn() }));
jest.mock('../model/review.model', () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn(), find: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() }));
jest.mock('../model/user.model', () => ({ find: jest.fn() }));
jest.mock('../helper/cache.helper', () => ({ NAMESPACES: { SELLER_RATING: 'seller-rating' }, del: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn(), createAuditLogAdmin: jest.fn().mockResolvedValue(null) }));

const reviewModel = require('../model/review.model');
const { createAuditLogAdmin } = require('../helper/audit.helper');
const adminReviewService = require('../service/admin/review.service');
const adminReviewValidation = require('../validation/admin/review.validation');

const REVIEW = '64b000000000000000000005';
const ADMIN = '64b0000000000000000000aa';

// getOne() chain after a successful moderate
const populated = (v) => {
  const chain = { populate: () => chain, lean: () => Promise.resolve(v) };
  return chain;
};

beforeEach(() => jest.clearAllMocks());

test('hide requires a reason; moderation body cannot carry ownership/rating fields', () => {
  expect(adminReviewValidation.ValidateModerate({ action: 'hide' }).error).toBeTruthy();
  const { value, error } = adminReviewValidation.ValidateModerate({ action: 'hide', reason: 'Abusive language', rating: 1, reviewer: 'x', reviewee: 'y' });
  expect(error).toBeUndefined();
  expect(value).toEqual({ action: 'hide', reason: 'Abusive language' });
});

test('hide flips visible → HIDDEN conditionally and writes an audit entry', async () => {
  reviewModel.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ _id: REVIEW, status: 'HIDDEN', reviewee: 's', reviewer: 'b', transaction: 't', rating: 1 }) });
  reviewModel.findOne.mockReturnValue(populated({ _id: REVIEW, status: 'HIDDEN' }));
  await adminReviewService.moderate({ reviewId: REVIEW, action: 'hide', reason: 'Abusive language', adminId: ADMIN });

  const [filter, update] = reviewModel.findOneAndUpdate.mock.calls[0];
  expect(filter.status).toEqual({ $nin: ['HIDDEN', 'INVALIDATED'] });
  expect(Object.keys(update.$set).sort()).toEqual(['moderation', 'status']);
  expect(createAuditLogAdmin).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_REVIEW_HIDDEN', adminId: ADMIN, reason: 'Abusive language' }));
  // the seller's public average must update immediately
  expect(require('../helper/cache.helper').del).toHaveBeenCalledWith('seller-rating', 's');
});

test('restoring an INVALIDATED (refunded) rating is refused', async () => {
  reviewModel.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
  reviewModel.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ status: 'INVALIDATED' }) }) });
  await expect(adminReviewService.moderate({ reviewId: REVIEW, action: 'restore', adminId: ADMIN })).rejects.toMatchObject({ statusCode: 409 });
  expect(createAuditLogAdmin).not.toHaveBeenCalled();
});

test('hiding an already-hidden rating → 409, no audit', async () => {
  reviewModel.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
  reviewModel.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ status: 'HIDDEN' }) }) });
  await expect(adminReviewService.moderate({ reviewId: REVIEW, action: 'hide', reason: 'spam spam', adminId: ADMIN })).rejects.toMatchObject({ statusCode: 409 });
  expect(createAuditLogAdmin).not.toHaveBeenCalled();
});
