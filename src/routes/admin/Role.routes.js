const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const roleController = require('../../controller/admin/role.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

// Staff roles = a name + a set of permission keys from the code catalog
// (constants/rbac.constants.js). Super Admin only (role:manage is reserved).
const roleAdmin = [adminMiddleWare, authorize(A.ROLE_MANAGE)];

router.get("/role/catalog", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...roleAdmin, roleController.catalog);
router.get("/role/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...roleAdmin, roleController.get);
router.post("/role/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...roleAdmin, roleController.add);
router.put("/role/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...roleAdmin, roleController.update);
router.delete("/role/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...roleAdmin, roleController.delete);
router.patch("/role/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...roleAdmin, roleController.status);

module.exports = router;
