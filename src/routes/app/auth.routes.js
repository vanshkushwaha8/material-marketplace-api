const express = require('express');
const authController = require('../../controller/app/auth.controller');
const passwordController = require('../../controller/app/password.controller');
const userConsentController = require("../../controller/admin/userconsent.controller");
const twofaController = require('../../controller/app/twofa.controller');
const userTypeConstants = require("../../constants/usertype.constants");
const { authMiddleware, twoFactorAuthenticationCheck, consentEnforced } = require("../../middleware/auth.middleware");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const router = express.Router();
router.post("/register", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), authController.register);
router.post("/login", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 20 }), authController.login);

router.get("/emailVerification", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), passwordController.emailVerification);
router.post("/resend-verification", authapiLimiter({ windowMs: 10 * 60 * 1000, max: 5, message: "Too many verification emails requested. Please wait before trying again." }), passwordController.resendVerfication);
router.get("/check-password-reset", authapiLimiter({ windowMs: 10 * 60 * 1000, max: 5 }), passwordController.checkPasswordResetToken);
router.get("/validate-reset-token", authapiLimiter({ windowMs: 10 * 60 * 1000, max: 5 }), passwordController.validateResetToken);

router.post('/2fa/login/send-email', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), twofaController.sendLoginEmailOtp);
router.post('/2fa/login/verify', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), twofaController.verifyLoginFactor);
router.post('/2fa/login/recovery', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), twofaController.verifyLoginWithRecoveryCode);
router.post("/updateProfile", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, consentEnforced, authController.updateProfile);
router.post("/changePassword", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, consentEnforced, passwordController.changePassword);
router.post("/accountDelete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, consentEnforced, authController.accountDelete);
router.get("/get-profile", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), consentEnforced, twoFactorAuthenticationCheck, authController.getProfile);
router.post("/logout", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), authController.logout);

router.post("/accept-consent", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), authController.acceptConsent);
router.get("/consent/profile", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authMiddleware([userTypeConstants.Seller, userTypeConstants.Buyer]), twoFactorAuthenticationCheck, authController.getProfileConsents);

router.get("/userconsent/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), userConsentController.get);

router.post('/request/password', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), passwordController.requestPasswordReset);
router.post('/reset/password', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), passwordController.resetPassword);

module.exports = router;
