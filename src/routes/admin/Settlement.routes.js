const express = require('express');
const adminMiddleWare = require('../../middleware/admin.middleware');
const settlementController = require('../../controller/admin/settlement.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get('/settlement-history', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.SETTLEMENT_READ), settlementController.list);

module.exports = router;
