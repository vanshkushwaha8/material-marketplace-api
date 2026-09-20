const express = require('express');
const reviewController = require('../../controller/app/review.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const anyAuth = [authMiddleware([userTypeConstants.Buyer, userTypeConstants.Seller]), twoFactorAuthenticationCheck];

router.post('/transactions/:id/review', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...anyAuth, reviewController.submit);
router.get('/reviews/mine', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...anyAuth, reviewController.myReviews);

module.exports = router;