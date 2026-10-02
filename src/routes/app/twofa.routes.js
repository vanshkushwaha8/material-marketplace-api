const express = require('express');
const twofaController = require('../../controller/app/twofa.controller');
const { authMiddleware ,twoFactorAuthenticationCheck} = require("../../middleware/auth.middleware");
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const router = express.Router();

// 2FA set-up/management runs BEFORE a session is 2FA-verified, so no
// twoFactorAuthenticationCheck here.
const accountAuth = [authMiddleware()];
router.post('/2fa/totp/provision', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.provisionTotp);
router.post('/2fa/totp/verify-setup', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.verifyTotpSetup);
router.post('/2fa/email/initiate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.initiateEmailSetup);
router.post('/2fa/email/verify-setup', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.verifyEmailSetup);
router.post('/2fa/acknowledge-recovery', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.acknowledgeRecoveryCodes);
router.post('/2fa/switch-method', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.switchMethod);
router.post('/2fa/recovery/regenerate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.regenerateRecoveryCodes);
router.post('/2fa/email/send-code', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.sendAccountEmailCode);
router.get('/2fa/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.getStatus);
router.post('/2fa/disable/initiate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.initiateDisable2FA);
router.post('/2fa/disable/confirm', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...accountAuth, authorize(P.ACCOUNT_MANAGE), twofaController.confirmDisable2FA);

module.exports = router;
