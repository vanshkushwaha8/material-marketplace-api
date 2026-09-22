const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const businessTypeController = require('../../controller/admin/businessType.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const router = express.Router();

router.get('/business-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.BUSINESSTYPE.BUSINESS_TYPE_VIEW), businessTypeController.list);
router.post('/business-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.BUSINESSTYPE.BUSINESS_TYPE_MANAGE), businessTypeController.create);
router.patch('/business-types/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.BUSINESSTYPE.BUSINESS_TYPE_MANAGE), businessTypeController.update);
router.delete('/business-types/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.BUSINESSTYPE.BUSINESS_TYPE_MANAGE), businessTypeController.remove);

module.exports = router;
