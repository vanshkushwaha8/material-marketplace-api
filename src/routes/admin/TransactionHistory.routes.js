const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const transactionHistoryController = require('../../controller/admin/transactionHistory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const router = express.Router();

router.get("/transaction-history", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW), transactionHistoryController.list);
router.get("/transaction-history/:id", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW), transactionHistoryController.getOne);
router.post("/transaction-history/:id/resolve-dispute", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.TRANSACTIONHISTORY.DISPUTE_MANAGE), transactionHistoryController.resolveDispute);

module.exports = router;
