const express = require('express');
const projectController = require('../../controller/app/project.controller');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/authorize.middleware');
const { USER_PERMISSIONS: P } = require('../../constants/rbac.constants');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Authenticated (+2FA when enabled); each route then names its permission.
const signedIn = [authMiddleware(), twoFactorAuthenticationCheck];

router.post('/projects', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.PROJECT_MANAGE), projectController.create);
router.get('/buyer/projects', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.PROJECT_MANAGE), projectController.myProjects);
router.get('/projects/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), ...signedIn, authorize(P.PROJECT_MANAGE), projectController.getOne);
router.patch('/projects/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), ...signedIn, authorize(P.PROJECT_MANAGE), projectController.update);
router.delete('/projects/:id', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), ...signedIn, authorize(P.PROJECT_MANAGE), projectController.remove);

module.exports = router;