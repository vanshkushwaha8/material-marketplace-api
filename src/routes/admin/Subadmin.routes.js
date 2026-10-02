const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const subAdminController = require('../../controller/admin/subadmin.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

// Staff (sub-admin) management is Super Admin only: staff:manage is a
// reserved permission no staff role can hold, so nobody can grant
// themselves (or a colleague) more access than they were given.
const staffAdmin = [adminMiddleWare, authorize(A.STAFF_MANAGE)];

router.post("/subadmin/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...staffAdmin, subAdminController.add);
router.put("/subadmin/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...staffAdmin, subAdminController.update);
router.get("/subadmin/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...staffAdmin, subAdminController.get);
router.post("/subadmin/resend", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...staffAdmin, subAdminController.resendInvite);
// Public: the invite token itself is the credential.
router.get("/subadmin/invitation/validate", authapiLimiter({ windowMs: 10 * 60 * 1000, max: 30 }), subAdminController.validateInvitation);
router.put("/subadmin/passwordset", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), subAdminController.passwordSet);
router.delete("/subadmin/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...staffAdmin, subAdminController.delete);
router.patch("/subadmin/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...staffAdmin, subAdminController.status);

module.exports = router;
