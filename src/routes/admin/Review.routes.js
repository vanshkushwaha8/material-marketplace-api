const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminReviewController = require('../../controller/admin/review.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const permissionMiddleware = require('../../middleware/permission.middleware');
const PERMISSIONSCONSTANTS = require('../../constants/permission.constant');
const router = express.Router();

const view = [authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.RATINGMANAGEMENT.RATING_VIEW)];

router.get('/reviews', ...view, adminReviewController.list);
router.get('/reviews/:id', ...view, adminReviewController.getOne);
router.patch(
  '/reviews/:id/moderate',
  authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  adminMiddleWare,
  permissionMiddleware(PERMISSIONSCONSTANTS.RATINGMANAGEMENT.RATING_MODERATE),
  adminReviewController.moderate
);

module.exports = router;
