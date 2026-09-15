const express = require('express');
const sessionController = require('../../controller/app/session.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware, twoFactorAuthenticationCheck } = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const router = express.Router();

router.post('/session/delete', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, sessionController.delete);
router.get('/session/get', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, sessionController.get);

module.exports = router;
