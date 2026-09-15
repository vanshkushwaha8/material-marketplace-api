const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const subAdminController = require('../../controller/admin/subadmin.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const permissionMiddleware = require("../../middleware/permission.middleware");
const router = express.Router();

router.post("/subadmin/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_ADD), subAdminController.add);
router.put("/subadmin/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),adminMiddleWare,  permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_EDIT), subAdminController.update);
router.get("/subadmin/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_VIEW), subAdminController.get);
router.get("/subadmin/resend", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_ADD), subAdminController.resendInvite);
router.put("/subadmin/passwordset", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), subAdminController.passwordSet);
router.delete("/subadmin/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_DELETE), subAdminController.delete);
router.get("/subadmin/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.SUBADMIN.ADMIN_STATUS_CHANGE), subAdminController.status);

module.exports = router;