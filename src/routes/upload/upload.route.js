const express = require('express');
const uploadRouter = express.Router();
const uploadController = require('../../controller/upload/imageupload.controller');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');

// Temp uploads only: a file is attached to a real record (listing, store,
// profile) exclusively by an authenticated, permission-checked save call.
uploadRouter.post('/singleImage', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), uploadController.singleImage);
uploadRouter.post('/multiImage', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), uploadController.mulitpleImage);
module.exports = uploadRouter;
