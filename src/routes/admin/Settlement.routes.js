const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const settlementController = require('../../controller/admin/settlement.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const permissionMiddleware = require('../../middleware/permission.middleware');
const PERMISSIONSCONSTANTS = require('../../constants/permission.constant');
const router = express.Router();

router.get('/settlement-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.SETTLEMENT_HISTORY_VIEW), settlementController.list);

module.exports = router;
