const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const commissionController = require('../../controller/admin/commission.controller');
const revenueAnalyticsController = require('../../controller/admin/revenueAnalytics.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/commission-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.COMMISSION_READ), commissionController.list);

// Commission & Revenue Analytics (admin only — commission:read). Order rows
// carry no buyer/seller identities; amounts come from the per-order snapshots.
router.get('/revenue-analytics', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 200 }), adminMiddleWare, authorize(A.COMMISSION_READ), revenueAnalyticsController.overview);
router.get('/revenue-analytics/orders', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.COMMISSION_READ), revenueAnalyticsController.orders);
router.get('/revenue-analytics/export', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), adminMiddleWare, authorize(A.COMMISSION_READ), revenueAnalyticsController.exportCsv);

module.exports = router;