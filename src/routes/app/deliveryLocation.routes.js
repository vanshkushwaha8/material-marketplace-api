const express = require('express');
const deliveryLocationController = require('../../controller/app/deliveryLocation.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.get('/delivery-locations', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.DELIVERY_LOCATION_MANAGE), deliveryLocationController.list);
router.post('/delivery-locations', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.DELIVERY_LOCATION_MANAGE), deliveryLocationController.create);
router.patch('/delivery-locations/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.DELIVERY_LOCATION_MANAGE), deliveryLocationController.update);
router.patch('/delivery-locations/:id/default', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.DELIVERY_LOCATION_MANAGE), deliveryLocationController.setDefault);
router.delete('/delivery-locations/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), ...signedIn, authorize(P.DELIVERY_LOCATION_MANAGE), deliveryLocationController.remove);

module.exports = router;
