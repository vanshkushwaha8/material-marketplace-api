const express = require('express');
const transactionController = require('../../controller/app/transaction.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/transactions/:id/cancel', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.cancel);
router.get('/transactions/:id/delivery-quote', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.deliveryQuote);
router.patch('/transactions/:id/fulfilment', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.setFulfilment);
router.post('/transactions/:id/handover', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.markHandover);
router.post('/transactions/:id/confirm-receipt', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.confirmReceipt);
router.post('/transactions/:id/dispute', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.ORDER_DISPUTE), transactionController.raiseDispute);
router.get('/transactions/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_READ), transactionController.getOne);
router.get('/buyer/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.myAsBuyer);
router.get('/seller/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.myAsSeller);

module.exports = router;