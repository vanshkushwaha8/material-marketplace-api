const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const materialCategoryController = require('../../controller/admin/materialCategory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/material-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.CATEGORY_READ), materialCategoryController.list);
router.post('/material-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.CATEGORY_MANAGE), materialCategoryController.create);
router.patch('/material-categories/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, authorize(A.CATEGORY_MANAGE), materialCategoryController.update);
router.delete('/material-categories/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), adminMiddleWare, authorize(A.CATEGORY_MANAGE), materialCategoryController.remove);

module.exports = router;
