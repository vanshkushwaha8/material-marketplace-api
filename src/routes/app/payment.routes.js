const express = require('express');
const paymentController = require('../../controller/app/payment.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/transactions/:id/payment-order', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.PAYMENT_CREATE), paymentController.createOrder);
router.post('/payments/verify', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.PAYMENT_CREATE), paymentController.verify);
// Dev/QA-only simulated success — createManualTestPayment() itself checks
// ENABLE_MANUAL_PAYMENT_TEST server-side and 404s when disabled, so this
// route is safe to leave mounted in every environment.
router.post('/transactions/:id/manual-test-payment', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.PAYMENT_CREATE), paymentController.manualTestPayment);
// No authMiddleware — provider-signed, not user-authenticated.
router.post('/payments/webhook/razorpay', authapiLimiter({ windowMs: 60 * 1000, max: 120 }), paymentController.webhook);

module.exports = router;