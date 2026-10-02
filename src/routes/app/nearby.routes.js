const express = require('express');
const nearbyController = require('../../controller/app/nearby.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const router = express.Router();

// Public, like material-listings browse — the buyer's coordinates are only
// used for this one query and are never stored.
router.get('/nearby/sellers', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 200 }), nearbyController.sellers);

module.exports = router;
