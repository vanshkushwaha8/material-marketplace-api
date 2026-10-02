const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const businessTypeController = require('../../controller/admin/businessType.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/business-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.BUSINESS_TYPE_READ), businessTypeController.list);
router.post('/business-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.BUSINESS_TYPE_MANAGE), businessTypeController.create);
router.patch('/business-types/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.BUSINESS_TYPE_MANAGE), businessTypeController.update);
router.delete('/business-types/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), adminMiddleWare, authorize(A.BUSINESS_TYPE_MANAGE), businessTypeController.remove);

module.exports = router;
