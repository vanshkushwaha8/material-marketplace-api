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
// Commission: the admin-configured rate per seller type (commission.service).
// Display only — the rate actually charged is locked on each transaction.
router.get('/config', async (request, response, nextFunction) => {
  try {
    const rates = await require('../../service/app/commission.service').getCurrentRates();
    return responseConstants.success(response, 'Public config fetched', {
      manualPaymentTestEnabled: configenv.ENABLE_MANUAL_PAYMENT_TEST,
      commissionPct: { INDIVIDUAL: rates.INDIVIDUAL.pct, BUSINESS_STORE: rates.BUSINESS_STORE.pct },
      // Back-compat for older clients: the individual-seller rate.
      marketplaceCommissionPct: rates.INDIVIDUAL.pct,
    }, statusCodes.OK);
  } catch (error) { return nextFunction(error); }
});

// Public XML sitemap of indexable marketplace pages (home, catalogue,
// category, LIVE listing and store URLs). SITE_URL (falls back to
// FRONTEND_URL) must be the public site origin so <loc> values match each
// page's canonical URL. Expose it at https://<site>/sitemap.xml via a
// reverse-proxy/host rewrite to /api/v1/sitemap.xml.
const { buildSitemapXml } = require('../../service/app/sitemap.service');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
router.get('/sitemap.xml', authapiLimiter({ windowMs: 15 * 60 * 1000, max: 60 }), async (request, response, nextFunction) => {
  try {
    const cache = require('../../helper/cache.helper');
    const xml = await cache.getOrSet(cache.NAMESPACES.SITEMAP, 'xml', 60 * 60, () => buildSitemapXml(configenv.SITE_URL || configenv.FRONTEND_URL));
    response.set('Content-Type', 'application/xml; charset=utf-8');
    response.set('Cache-Control', 'public, max-age=3600');
    return response.status(200).send(xml);
  } catch (error) {
    return nextFunction(error);
  }
});

module.exports = router;
