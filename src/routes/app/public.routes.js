const express = require('express');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const configenv = require('../../config/env.config');
const router = express.Router();

// NOTE: previously served public FAQ, complaint-CMS, and compliant-category
// reads — all removed along with the support/FAQ/complaint system. Left
// as an empty router (rather than removed) so routes/app/index.js's
// `userRouter.use('/', publicRoutes)` doesn't need touching if a genuinely
// public marketplace endpoint needs a home here later.

// Lets the frontend conditionally render "Manual Payment (Test)" instead of
// hardcoding a frontend constant that can't reflect the backend's actual
// ENABLE_MANUAL_PAYMENT_TEST setting — this is UX only, the real enforcement
// is the env-gated check inside payment.service.js#createManualTestPayment.
router.get('/config', (request, response) => {
  return responseConstants.success(response, 'Public config fetched', {
    manualPaymentTestEnabled: configenv.ENABLE_MANUAL_PAYMENT_TEST,
    marketplaceCommissionPct: Number(configenv.MARKETPLACE_COMMISSION_PCT),
  }, statusCodes.OK);
});

module.exports = router;
