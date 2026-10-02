const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const adminNotificationController = require('../../controller/admin/adminNotification.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Any authenticated admin; visibility is filtered by their permissions in
// the service, so no single permissionMiddleware gate applies here.
router.get('/notifications', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminNotificationController.list);
router.get('/notifications/unread-count', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminNotificationController.unreadCount);
router.patch('/notifications/read-all', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), adminMiddleWare, adminNotificationController.markAllRead);
router.patch('/notifications/:id/read', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminNotificationController.markRead);
router.get('/notifications/stream', adminMiddleWare, adminNotificationController.stream);

module.exports = router;
