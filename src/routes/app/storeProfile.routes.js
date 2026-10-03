const express = require('express');
const storeProfileController = require('../../controller/app/storeProfile.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

// Seller managing their own store
router.get('/seller/store-profile', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.STORE_MANAGE), storeProfileController.getMine);
router.patch('/seller/store-profile', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.STORE_MANAGE), storeProfileController.updateMine);

// Public storefront — no auth, mirrors material-listings' public browse routes
router.get('/stores/:sellerId', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), storeProfileController.getPublic);
router.get('/stores/:sellerId/products', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), storeProfileController.getProducts);

module.exports = router;
