const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const commissionController = require('../../controller/admin/commission.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const permissionMiddleware = require('../../middleware/permission.middleware');
const PERMISSIONSCONSTANTS = require('../../constants/permission.constant');
const router = express.Router();

router.get('/commission-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.COMMISSION_HISTORY_VIEW), commissionController.list);

module.exports = router;