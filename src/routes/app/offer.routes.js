const express = require('express');
const offerController = require('../../controller/app/offer.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.OFFER_CREATE), offerController.create);
router.patch('/offers/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.OFFER_RESPOND), offerController.respond);
router.get('/offers/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.OFFER_RESPOND), offerController.getOne);
router.get('/buyer/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.OFFER_CREATE), offerController.myAsBuyer);
router.get('/seller/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.OFFER_RECEIVE), offerController.myAsSeller);

module.exports = router;
