const express = require('express');
const uploadRouter = express.Router();
const uploadController = require('../../controller/upload/imageupload.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');

// NOTE: this used to also accept a "Bearer relay:<token>" mobile-QR-relay
// auth path for KYC document capture handoff from a phone. That whole
// mobile-relay/KYC flow was removed; every caller now goes through this
// route's normal auth middleware upstream (or none, for temp-upload —
// finalization into a real record always happens behind real auth).
uploadRouter.post('/singleImage', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), uploadController.singleImage);
uploadRouter.post('/multiImage', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), uploadController.mulitpleImage);
module.exports = uploadRouter;
