const express = require('express');
const savedListingController = require('../../controller/app/savedListing.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/saved-listings/toggle', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.SAVED_LISTING_MANAGE), savedListingController.toggle);
router.get('/saved-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.SAVED_LISTING_MANAGE), savedListingController.list);

module.exports = router;
