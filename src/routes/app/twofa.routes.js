const express = require('express');
const twofaController = require('../../controller/app/twofa.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware ,twoFactorAuthenticationCheck} = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const router = express.Router();
const kycAuth = [
    authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]),
];
router.post('/2fa/totp/provision', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.provisionTotp);
router.post('/2fa/totp/verify-setup', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...kycAuth, twofaController.verifyTotpSetup);
router.post('/2fa/email/initiate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.initiateEmailSetup);
router.post('/2fa/email/verify-setup', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), ...kycAuth, twofaController.verifyEmailSetup);
router.post('/2fa/acknowledge-recovery', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.acknowledgeRecoveryCodes);
router.post('/2fa/switch-method', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.switchMethod);
router.post('/2fa/recovery/regenerate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), ...kycAuth, twofaController.regenerateRecoveryCodes);
router.get('/2fa/status', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...kycAuth, twofaController.getStatus);
router.post('/2fa/disable/initiate', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.initiateDisable2FA);
router.post('/2fa/disable/confirm', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), ...kycAuth, twofaController.confirmDisable2FA);

module.exports = router;
