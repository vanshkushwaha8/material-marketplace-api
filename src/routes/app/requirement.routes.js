const express = require('express');
const requirementController = require('../../controller/app/requirement.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.REQUIREMENT_POST), requirementController.create);
router.get('/buyer/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.REQUIREMENT_POST), requirementController.myRequirements);
router.patch('/requirements/:id/close', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.REQUIREMENT_POST), requirementController.close);
router.get('/requirements/:id/responses', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.REQUIREMENT_POST), requirementController.getResponses);

router.get('/seller/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.REQUIREMENT_RESPOND), requirementController.browse);
router.post('/requirements/:id/respond', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.REQUIREMENT_RESPOND), requirementController.respond);

module.exports = router;