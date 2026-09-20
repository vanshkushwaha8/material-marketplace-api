const express = require('express');
const notificationController = require('../../controller/app/notification.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const pushTokenController = require('../../controller/app/pushToken.controller');
const router = express.Router();

// Both Buyer and Seller — notifications are keyed by recipient, not role.
const anyAuth = [authMiddleware([userTypeConstants.Buyer, userTypeConstants.Seller]), twoFactorAuthenticationCheck];

router.get('/notifications', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...anyAuth, notificationController.list);
router.get('/notifications/unread-count', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...anyAuth, notificationController.unreadCount);
router.patch('/notifications/:id/read', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 200 }), ...anyAuth, notificationController.markRead);
router.patch('/notifications/read-all', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), ...anyAuth, notificationController.markAllRead);
router.get('/notifications/stream', ...anyAuth, notificationController.stream);

router.post('/notifications/register-device', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...anyAuth, pushTokenController.register);
router.post('/notifications/unregister-device', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...anyAuth, pushTokenController.unregister);
module.exports = router; 