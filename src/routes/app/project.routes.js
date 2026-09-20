const express = require('express');
const projectController = require('../../controller/app/project.controller');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

const buyerAuth = [authMiddleware([userTypeConstants.Buyer]), twoFactorAuthenticationCheck];

router.post('/projects', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...buyerAuth, projectController.create);
router.get('/buyer/projects', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, projectController.myProjects);
router.get('/projects/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...buyerAuth, projectController.getOne);

module.exports = router;