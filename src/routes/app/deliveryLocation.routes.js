const express = require('express');
const deliveryLocationController = require('../../controller/app/deliveryLocation.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];

router.get('/delivery-locations', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, deliveryLocationController.list);
router.post('/delivery-locations', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...buyerAuth, deliveryLocationController.create);
router.patch('/delivery-locations/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...buyerAuth, deliveryLocationController.update);
router.patch('/delivery-locations/:id/default', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...buyerAuth, deliveryLocationController.setDefault);
router.delete('/delivery-locations/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...buyerAuth, deliveryLocationController.remove);

module.exports = router;
