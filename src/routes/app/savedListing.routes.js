const express = require('express');
const savedListingController = require('../../controller/app/savedListing.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];

router.post('/saved-listings/toggle', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...buyerAuth, savedListingController.toggle);
router.get('/saved-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, savedListingController.list);

module.exports = router;
