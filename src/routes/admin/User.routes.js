const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminUserController = require('../../controller/admin/user.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

const view = [authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.USER_READ)];

router.get('/users', ...view, adminUserController.list);
router.get('/users/:id', ...view, adminUserController.getOne);
router.get('/users/:id/listings', ...view, adminUserController.sub('listings'));
router.get('/users/:id/offers', ...view, adminUserController.sub('offers'));
router.get('/users/:id/transactions', ...view, adminUserController.sub('transactions'));
router.get('/users/:id/payments', ...view, adminUserController.sub('payments'));
router.get('/users/:id/payouts', ...view, adminUserController.sub('payouts'));
router.get('/users/:id/reviews', ...view, adminUserController.sub('reviews'));
router.get('/users/:id/history', ...view, adminUserController.sub('history'));
router.patch(
  '/users/:id/status',
  authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  adminMiddleWare,
  authorize(A.USER_MANAGE),
  adminUserController.updateStatus
);

module.exports = router;
