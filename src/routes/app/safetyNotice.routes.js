const express = require('express');
const safetyNoticeController = require('../../controller/app/safetyNotice.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

// Buyer and seller fraud-awareness notice — about the signed-in user's own
// account only (role comes from the account, not the request).
router.get('/safety-notice', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 120 }), ...signedIn, authorize(P.ORDER_READ), safetyNoticeController.status);
router.post('/safety-notice', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.ORDER_READ), safetyNoticeController.record);

module.exports = router;
