const express = require('express');
const materialCategoryController = require('../../controller/app/materialCategory.controller');
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();

// Public — no auth. Buyers/sellers both need the taxonomy (browse filters,
// listing-creation form) before they necessarily have an account context.
router.get('/material-categories', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), materialCategoryController.list);

module.exports = router;
