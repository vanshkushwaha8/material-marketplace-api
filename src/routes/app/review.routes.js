const express = require('express');
const reviewController = require('../../controller/app/review.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/transactions/:id/review', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.REVIEW_MANAGE), reviewController.submit);
router.patch('/reviews/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.REVIEW_MANAGE), reviewController.update);
router.get('/reviews/mine', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.REVIEW_MANAGE), reviewController.myReviews);

// Public: a seller's visible ratings + summary (store page).
router.get('/sellers/:sellerId/reviews', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), reviewController.sellerReviews);
// Buyer: which of my completed orders with this seller I can still rate,
// and my existing ratings for them.
router.get('/sellers/:sellerId/rating-status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_PURCHASE), reviewController.myRatingStatus);

module.exports = router;
