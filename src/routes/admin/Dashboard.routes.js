const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const dashboardController = require('../../controller/admin/dashboard.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();
// The feed IS audit-log data (actors, IPs, metadata) — it needs
// audit_log:read as well, or dashboard:read would bypass it.
router.get("/dashboard/activity-feed", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), 
adminMiddleWare, authorize(A.DASHBOARD_READ, A.AUDIT_LOG_READ), dashboardController.activityFeed);

module.exports = router;