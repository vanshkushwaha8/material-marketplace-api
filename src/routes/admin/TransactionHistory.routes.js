const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const transactionHistoryController = require('../../controller/admin/transactionHistory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get("/transaction-history", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.TRANSACTION_READ), transactionHistoryController.list);
router.post("/transaction-history/:id/resolve-dispute", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), adminMiddleWare, authorize(A.DISPUTE_RESOLVE), transactionHistoryController.resolveDispute);

module.exports = router;
