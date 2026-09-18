const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminPaymentController = require('../../controller/admin/payment.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const permissionMiddleware = require('../../middleware/permission.middleware');
const PERMISSIONSCONSTANTS = require('../../constants/permission.constant');
const router = express.Router();

router.get('/payment-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.PAYMENT_HISTORY_VIEW), adminPaymentController.list);
router.post('/payments/:id/refund', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.REFUND_MANAGE), adminPaymentController.refund);

module.exports = router;