const express = require('express');
const transactionController = require('../../controller/app/transaction.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];
const sellerAuth = [authMiddleware([userTypeConstants.Seller]), twoFactorAuthenticationCheck];
const eitherAuth = [authMiddleware([userTypeConstants.Buyer, userTypeConstants.Seller]), twoFactorAuthenticationCheck];

// router.post('/transactions/:id/confirm-payment', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...buyerAuth, transactionController.confirmPayment);
router.post('/transactions/:id/handover', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...sellerAuth, transactionController.markHandover);
router.post('/transactions/:id/confirm-receipt', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...buyerAuth, transactionController.confirmReceipt);
router.post('/transactions/:id/dispute', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...eitherAuth, transactionController.raiseDispute);
router.get('/transactions/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...eitherAuth, transactionController.getOne);
router.get('/buyer/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, transactionController.myAsBuyer);
router.get('/seller/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, transactionController.myAsSeller);

module.exports = router;