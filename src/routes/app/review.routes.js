const express = require('express');
const reviewController = require('../../controller/app/review.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const anyAuth = [authMiddleware([userTypeConstants.Buyer, userTypeConstants.Seller]), twoFactorAuthenticationCheck];
const buyerOnly = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];

router.post('/transactions/:id/review', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...anyAuth, reviewController.submit);
router.patch('/reviews/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...anyAuth, reviewController.update);
router.get('/reviews/mine', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...anyAuth, reviewController.myReviews);

// Public: a seller's visible ratings + summary (store page).
router.get('/sellers/:sellerId/reviews', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), reviewController.sellerReviews);
// Buyer: which of my completed orders with this seller I can still rate,
// and my existing ratings for them.
router.get('/sellers/:sellerId/rating-status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerOnly, reviewController.myRatingStatus);

module.exports = router;
