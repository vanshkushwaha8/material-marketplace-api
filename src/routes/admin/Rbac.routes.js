const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const moduleController = require('../../controller/admin/module.controller');
const permissionController = require('../../controller/admin/permission.controller');
const roleController = require('../../controller/admin/role.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");

const permissionMiddleware = require("../../middleware/permission.middleware");
const { twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const router = express.Router();

// module
router.post("/module/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.MODULEVIEW.MODULE_ADD), moduleController.add);
router.put("/module/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.MODULEVIEW.MODULE_EDIT),  moduleController.update);
router.get("/module/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.MODULEVIEW.MODULE_VIEW),  moduleController.get);
router.delete("/module/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.MODULEVIEW.MODULE_DELETE),  moduleController.delete);
router.get("/module/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.MODULEVIEW.MODULE_STATUS_CHANGE), moduleController.status);

// permission
router.post("/permission/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_ADD), permissionController.add);
router.put("/permission/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_EDIT), permissionController.update);
router.get("/permission/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_VIEW),  permissionController.get);
router.get("/permission/getAll", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_VIEW), permissionController.getAll);
router.delete("/permission/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_DELETE),  permissionController.delete);
router.get("/permission/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.PERMISSION.PERMISSION_STATUS_CHANGE),  permissionController.status);

// role — mutations (add/update/delete) require Super Admin specifically
router.post("/role/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.ROLE.ROLE_ADD),  roleController.add);
router.put("/role/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.ROLE.ROLE_EDIT),  roleController.update);
router.get("/role/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }),  adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.ROLE.ROLE_VIEW), roleController.get);
router.delete("/role/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.ROLE.ROLE_DELETE),   roleController.delete);
router.get("/role/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.ROLE.ROLE_STATUS_CHANGE),  roleController.status);

module.exports = router;