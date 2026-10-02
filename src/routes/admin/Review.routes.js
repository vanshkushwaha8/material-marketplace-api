const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminReviewController = require('../../controller/admin/review.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

const view = [authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.REVIEW_READ)];

router.get('/reviews', ...view, adminReviewController.list);
router.get('/reviews/:id', ...view, adminReviewController.getOne);
router.patch(
  '/reviews/:id/moderate',
  authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  adminMiddleWare,
  authorize(A.REVIEW_MODERATE),
  adminReviewController.moderate
);

module.exports = router;
