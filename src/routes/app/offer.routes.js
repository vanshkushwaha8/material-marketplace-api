const express = require('express');
const offerController = require('../../controller/app/offer.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];
const sellerAuth = [authMiddleware([userTypeConstants.Seller]), twoFactorAuthenticationCheck];
const eitherAuth = [authMiddleware([userTypeConstants.Buyer, userTypeConstants.Seller]), twoFactorAuthenticationCheck];

router.post('/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...buyerAuth, offerController.create);
router.patch('/offers/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...eitherAuth, offerController.respond);
router.get('/offers/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...eitherAuth, offerController.getOne);
router.get('/buyer/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, offerController.myAsBuyer);
router.get('/seller/offers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, offerController.myAsSeller);

module.exports = router;
