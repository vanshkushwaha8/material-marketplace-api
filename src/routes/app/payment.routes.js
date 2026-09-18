const express = require('express');
const paymentController = require('../../controller/app/payment.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];

router.post('/transactions/:id/payment-order', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...buyerAuth, paymentController.createOrder);
router.post('/payments/verify', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...buyerAuth, paymentController.verify);
// No authMiddleware — provider-signed, not user-authenticated.
router.post('/payments/webhook/razorpay', authapiLimiter({ windowMs: 60 * 1000, max: 120 }), paymentController.webhook);

module.exports = router;