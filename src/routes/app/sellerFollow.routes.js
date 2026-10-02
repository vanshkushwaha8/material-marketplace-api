const express = require('express');
const sellerFollowController = require('../../controller/app/sellerFollow.controller');
const { authMiddleware, twoFactorAuthenticationCheck, softAuthMiddleware } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

// Only buyers can follow — sellers/admins get 403 from authMiddleware.
const writeLimit = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

router.post('/sellers/:sellerId/follow', writeLimit, ...signedIn, authorize(P.SELLER_FOLLOW), sellerFollowController.follow);
router.delete('/sellers/:sellerId/follow', writeLimit, ...signedIn, authorize(P.SELLER_FOLLOW), sellerFollowController.unfollow);
// Public count; softAuth adds `following` for a signed-in buyer.
router.get('/sellers/:sellerId/follow-status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), softAuthMiddleware, sellerFollowController.status);

module.exports = router;
