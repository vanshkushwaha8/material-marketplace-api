const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const controller = require('../../controller/admin/escrow.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize, authorizeAny } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

const read = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 });
const write = authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

// Full money-flow view of one transaction (escrow ledger, payment attempts,
// payout, commission lock, available actions).
router.get('/transactions/:id/payment', read, adminMiddleWare, authorize(A.TRANSACTION_READ), controller.getDetail);
// Recovery / resolution actions. This gate only admits admins holding at
// least one payment-action permission; the controller then requires the
// exact permission(s) for the action in the body (ESCROW_ACTION_PERMISSIONS).
router.post('/transactions/:id/payment-actions', write, adminMiddleWare, authorizeAny(A.PAYMENT_RELEASE, A.PAYMENT_REFUND, A.PAYMENT_MANUAL_RESOLVE), controller.performAction);
router.get('/payments/attention', read, adminMiddleWare, authorize(A.TRANSACTION_READ), controller.attentionQueue);

router.get('/commission-settings', read, adminMiddleWare, authorize(A.COMMISSION_READ), controller.getCommission);
router.put('/commission-settings', write, adminMiddleWare, authorize(A.COMMISSION_UPDATE), controller.updateCommission);

// Delivery rate card — a pricing setting like commission, same permissions.
router.get('/delivery-rates', read, adminMiddleWare, authorize(A.COMMISSION_READ), controller.getDeliveryRates);
router.put('/delivery-rates', write, adminMiddleWare, authorize(A.COMMISSION_UPDATE), controller.updateDeliveryRates);
// Delivery vehicle catalogue — same pricing-settings permissions.
router.get('/vehicle-types', read, adminMiddleWare, authorize(A.COMMISSION_READ), controller.listVehicleTypes);
router.post('/vehicle-types', write, adminMiddleWare, authorize(A.COMMISSION_UPDATE), controller.createVehicleType);
router.patch('/vehicle-types/:id', write, adminMiddleWare, authorize(A.COMMISSION_UPDATE), controller.updateVehicleType);

module.exports = router;
