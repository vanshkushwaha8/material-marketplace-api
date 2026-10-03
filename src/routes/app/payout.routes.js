const express = require('express');
const payoutController = require('../../controller/app/payout.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/seller/bank-account', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...signedIn, authorize(P.PAYOUT_MANAGE), payoutController.linkBankAccount);
router.get('/seller/bank-account', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.PAYOUT_MANAGE), payoutController.getBankAccount);
// Limited well below the page-load limits — refresh=true can call the provider.
router.get('/seller/payout-readiness', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.PAYOUT_MANAGE), payoutController.payoutReadiness);
router.post('/seller/payouts/:id/retry', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.PAYOUT_MANAGE), payoutController.retryPayout);
router.get('/seller/payouts', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.PAYOUT_MANAGE), payoutController.myPayouts);

module.exports = router;