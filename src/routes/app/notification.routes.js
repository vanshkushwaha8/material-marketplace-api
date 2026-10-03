const express = require('express');
const notificationController = require('../../controller/app/notification.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const pushTokenController = require('../../controller/app/pushToken.controller');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

// Both Buyer and Seller — notifications are keyed by recipient, not role.

router.get('/notifications', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.NOTIFICATION_READ), notificationController.list);
router.get('/notifications/unread-count', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.NOTIFICATION_READ), notificationController.unreadCount);
router.patch('/notifications/:id/read', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 200 }), ...signedIn, authorize(P.NOTIFICATION_READ), notificationController.markRead);
router.patch('/notifications/read-all', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), ...signedIn, authorize(P.NOTIFICATION_READ), notificationController.markAllRead);
router.get('/notifications/stream', ...signedIn, authorize(P.NOTIFICATION_READ), notificationController.stream);

router.post('/notifications/register-device', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.NOTIFICATION_READ), pushTokenController.register);
router.post('/notifications/unregister-device', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...signedIn, authorize(P.NOTIFICATION_READ), pushTokenController.unregister);
module.exports = router; 