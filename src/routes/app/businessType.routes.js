const express = require('express');
const businessTypeController = require('../../controller/app/businessType.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Public — no auth. The registration form needs this before the user
// necessarily has an account context.
router.get('/business-types', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), businessTypeController.list);

module.exports = router;
