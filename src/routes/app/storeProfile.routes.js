const express = require('express');
const storeProfileController = require('../../controller/app/storeProfile.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const sellerAuth = [authMiddleware([userTypeConstants.Seller]), twoFactorAuthenticationCheck];

// Seller managing their own store
router.get('/seller/store-profile', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...sellerAuth, storeProfileController.getMine);
router.patch('/seller/store-profile', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...sellerAuth, storeProfileController.updateMine);

// Public storefront — no auth, mirrors material-listings' public browse routes
router.get('/stores/:sellerId', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), storeProfileController.getPublic);
router.get('/stores/:sellerId/products', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), storeProfileController.getProducts);

module.exports = router;
