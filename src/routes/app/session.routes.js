const express = require('express');
const sessionController = require('../../controller/app/session.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const router = express.Router();

router.post('/session/delete', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware(), twoFactorAuthenticationCheck, authorize(P.ACCOUNT_MANAGE), sessionController.delete);
router.post('/session/delete-others', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), authMiddleware(), twoFactorAuthenticationCheck, authorize(P.ACCOUNT_MANAGE), sessionController.deleteOthers);
router.get('/session/get', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware(), twoFactorAuthenticationCheck, authorize(P.ACCOUNT_MANAGE), sessionController.get);

module.exports = router;
