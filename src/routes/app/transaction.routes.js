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
// Seller-quoted delivery (deliveryQuote.service). Buyer: preview, accept,
// reject (choosing delivery itself is PATCH …/fulfilment). Seller: quote, decline.
router.get('/transactions/:id/delivery-requirement', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.deliveryRequirement);
router.post('/transactions/:id/delivery-quote', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.submitDeliveryQuote);
router.post('/transactions/:id/delivery-quote/decline', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.declineDelivery);
router.post('/transactions/:id/delivery-quote/accept', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.acceptDeliveryQuote);
router.post('/transactions/:id/delivery-quote/reject', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.rejectDeliveryQuote);
router.get('/vehicle-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_READ), transactionController.vehicleTypes);
router.patch('/transactions/:id/fulfilment', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.setFulfilment);
router.post('/transactions/:id/handover', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.markHandover);
router.post('/transactions/:id/confirm-receipt', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.confirmReceipt);
router.post('/transactions/:id/dispute', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.ORDER_DISPUTE), transactionController.raiseDispute);
router.get('/transactions/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_READ), transactionController.getOne);
router.get('/buyer/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_PURCHASE), transactionController.myAsBuyer);
router.get('/seller/transactions', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.ORDER_FULFIL), transactionController.myAsSeller);

module.exports = router;