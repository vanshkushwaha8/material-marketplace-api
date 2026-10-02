const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const adminController = require('../../controller/admin/auth.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();
router.post("/login", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), adminController.login);
// Forgot password (public; generic answers, token checks server side)
router.post("/forgot-password", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), adminController.forgotPassword);
router.get("/reset-password/validate", authapiLimiter({ windowMs: 10 * 60 * 1000, max: 30 }), adminController.validateResetToken);
router.post("/reset-password", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), adminController.resetPassword);
router.post("/changePassword", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminController.changePassword);
router.get("/getProfile", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminController.getProfile);
router.post("/updateProfile", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), adminMiddleWare, adminController.updateProfile);
router.post("/logout", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, adminController.logout);
module.exports = router;