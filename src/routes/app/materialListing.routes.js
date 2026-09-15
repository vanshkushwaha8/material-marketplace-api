const express = require('express');
const materialListingController = require('../../controller/app/materialListing.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

const sellerAuth = [
    authMiddleware([userTypeConstants.Seller]),
    twoFactorAuthenticationCheck,
];

// Public browse/search/detail — no auth required.
router.get('/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), materialListingController.search);
router.get('/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), materialListingController.getOne);

// Seller-only management.
router.get('/seller/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, materialListingController.myListings);
router.get('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, materialListingController.getMine);
router.post('/seller/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...sellerAuth, materialListingController.create);
router.patch('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...sellerAuth, materialListingController.update);
router.post('/seller/material-listings/:id/submit', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...sellerAuth, materialListingController.submit);
router.patch('/seller/material-listings/:id/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...sellerAuth, materialListingController.setStatus);
router.delete('/seller/material-listings/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...sellerAuth, materialListingController.remove);

module.exports = router;
