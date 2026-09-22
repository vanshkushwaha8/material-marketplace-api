const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const storeCategoryController = require('../../controller/admin/storeCategory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const router = express.Router();

router.get('/store-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.STORECATEGORY.STORE_CATEGORY_VIEW), storeCategoryController.list);
router.post('/store-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.STORECATEGORY.STORE_CATEGORY_MANAGE), storeCategoryController.create);
router.patch('/store-categories/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.STORECATEGORY.STORE_CATEGORY_MANAGE), storeCategoryController.update);
router.delete('/store-categories/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.STORECATEGORY.STORE_CATEGORY_MANAGE), storeCategoryController.remove);

module.exports = router;
