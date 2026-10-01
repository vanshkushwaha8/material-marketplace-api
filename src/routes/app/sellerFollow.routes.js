const express = require('express');
const sellerFollowController = require('../../controller/app/sellerFollow.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck, softAuthMiddleware } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Only buyers can follow — sellers/admins get 403 from authMiddleware.
const buyerOnly = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];
const writeLimit = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

router.post('/sellers/:sellerId/follow', writeLimit, ...buyerOnly, sellerFollowController.follow);
router.delete('/sellers/:sellerId/follow', writeLimit, ...buyerOnly, sellerFollowController.unfollow);
// Public count; softAuth adds `following` for a signed-in buyer.
router.get('/sellers/:sellerId/follow-status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), softAuthMiddleware, sellerFollowController.status);

module.exports = router;
