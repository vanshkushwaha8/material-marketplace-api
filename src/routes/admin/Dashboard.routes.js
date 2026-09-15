const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const dashboardController = require('../../controller/admin/dashboard.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const permissionMiddleware = require("../../middleware/permission.middleware");
const router = express.Router();
router.get("/dashboard/activity-feed", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), 
adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.DASHBOARD.DASHBOARD_VIEW), dashboardController.activityFeed);

module.exports = router;