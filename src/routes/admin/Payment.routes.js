const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminPaymentController = require('../../controller/admin/payment.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/payment-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.PAYMENT_READ), adminPaymentController.list);
router.post('/payments/:id/refund', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), adminMiddleWare, authorize(A.PAYMENT_REFUND), adminPaymentController.refund);

module.exports = router;