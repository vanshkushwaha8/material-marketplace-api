const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const materialListingController = require('../../controller/admin/materialListing.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/material-listings/moderation-queue', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.LISTING_READ), materialListingController.moderationQueue);
router.get('/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.LISTING_READ), materialListingController.listAll);
router.get("/material-listings/:id", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.LISTING_READ), materialListingController.getOne);
router.post('/material-listings/:id/decision', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.LISTING_MODERATE), materialListingController.decide);
router.patch('/material-listings/:id/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.LISTING_MODERATE), materialListingController.statusChange);

module.exports = router;
