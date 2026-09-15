const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const transactionHistoryController = require('../../controller/admin/transactionHistory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const router = express.Router();

router.get("/transaction-history", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW), transactionHistoryController.list);

module.exports = router;
