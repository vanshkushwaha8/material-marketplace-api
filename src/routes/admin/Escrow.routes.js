const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const controller = require('../../controller/admin/escrow.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const permissionMiddleware = require('../../middleware/permission.middleware');
const P = require('../../constants/permission.constant');
const router = express.Router();

const read = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 });
const write = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

// Full money-flow view of one transaction (escrow ledger, payment attempts,
// payout, commission lock, available actions).
router.get('/transactions/:id/payment', read, adminMiddleWare, permissionMiddleware(P.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW), controller.getDetail);
// Recovery / resolution actions (manual ones additionally need
// PAYMENTCONTROL.MANUAL_RESOLUTION, checked in the controller).
router.post('/transactions/:id/payment-actions', write, adminMiddleWare, permissionMiddleware(P.PAYMENTCONTROL.ESCROW_ACTION), controller.performAction);
router.get('/payments/attention', read, adminMiddleWare, permissionMiddleware(P.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW), controller.attentionQueue);

router.get('/commission-settings', read, adminMiddleWare, permissionMiddleware(P.PAYMENTCONTROL.COMMISSION_VIEW), controller.getCommission);
router.put('/commission-settings', write, adminMiddleWare, permissionMiddleware(P.PAYMENTCONTROL.COMMISSION_MANAGE), controller.updateCommission);

module.exports = router;
