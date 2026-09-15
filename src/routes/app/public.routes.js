const express = require('express');
const router = express.Router();

// NOTE: previously served public FAQ, complaint-CMS, and compliant-category
// reads — all removed along with the support/FAQ/complaint system. Left
// as an empty router (rather than removed) so routes/app/index.js's
// `userRouter.use('/', publicRoutes)` doesn't need touching if a genuinely
// public marketplace endpoint needs a home here later.
module.exports = router;
