const express = require('express');
const storeCategoryController = require('../../controller/app/storeCategory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Public — no auth. The registration form needs this before the user
// necessarily has an account context.
router.get('/store-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), storeCategoryController.list);

module.exports = router;
