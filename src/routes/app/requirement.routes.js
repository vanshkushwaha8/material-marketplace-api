const express = require('express');
const requirementController = require('../../controller/app/requirement.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];
const sellerAuth = [authMiddleware([userTypeConstants.Seller]), twoFactorAuthenticationCheck];

router.post('/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...buyerAuth, requirementController.create);
router.get('/buyer/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, requirementController.myRequirements);
router.patch('/requirements/:id/close', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...buyerAuth, requirementController.close);
router.get('/requirements/:id/responses', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, requirementController.getResponses);

router.get('/seller/requirements', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...sellerAuth, requirementController.browse);
router.post('/requirements/:id/respond', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...sellerAuth, requirementController.respond);

module.exports = router;