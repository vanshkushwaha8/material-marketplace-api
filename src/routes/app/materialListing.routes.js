const express = require('express');
const materialListingController = require('../../controller/app/materialListing.controller');
const { authMiddleware, twoFactorAuthenticationCheck, softAuthMiddleware } = require("../../middleware/auth.middleware");
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

// Public browse/search/detail — no auth required.
router.get('/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), materialListingController.search);
// softAuth: still public, but lets getOne recognise the owner / a buyer
// with an offer on it when the listing isn't publicly visible.
router.get('/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), softAuthMiddleware, materialListingController.getOne);

// Seller-only management.
router.get('/seller/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.myListings);
router.get('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.getMine);
router.post('/seller/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.create);
router.patch('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.update);
router.post('/seller/material-listings/:id/submit', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.submit);
router.patch('/seller/material-listings/:id/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.setStatus);
router.delete('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.LISTING_MANAGE), materialListingController.remove);

module.exports = router;
