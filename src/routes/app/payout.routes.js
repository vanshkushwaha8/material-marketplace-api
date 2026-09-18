const express = require('express');
const payoutController = require('../../controller/app/payout.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const sellerAuth = [authMiddleware([userTypeConstants.Seller]), twoFactorAuthenticationCheck];

router.post('/seller/bank-account', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...sellerAuth, payoutController.linkBankAccount);
router.get('/seller/bank-account', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...sellerAuth, payoutController.getBankAccount);
router.post('/seller/payouts/:id/retry', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...sellerAuth, payoutController.retryPayout);
router.get('/seller/payouts', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, payoutController.myPayouts);

module.exports = router;