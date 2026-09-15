const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const materialListingController = require('../../controller/admin/materialListing.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const router = express.Router();

router.get('/material-listings/moderation-queue', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.MATERIALLISTING.MATERIAL_LISTING_VIEW), materialListingController.moderationQueue);
router.get('/material-listings', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.MATERIALLISTING.MATERIAL_LISTING_VIEW), materialListingController.listAll);
router.get("/material-listings/:id", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.MATERIALLISTING.MATERIAL_LISTING_VIEW), materialListingController.getOne);
router.post('/material-listings/:id/decision', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.MATERIALLISTING.MATERIAL_LISTING_MODERATE), materialListingController.decide);
router.patch('/material-listings/:id/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.MATERIALLISTING.MATERIAL_LISTING_MODERATE), materialListingController.statusChange);

module.exports = router;
