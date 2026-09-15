const crypto = require('crypto');
const configenv = require('../../config/env.config');
const logger = require('../../logger/error.logger');

/**
 * ---------------------------------------------------------------------------
 * THIS IS NOT A REAL INTEGRATION. There is no public Bank of Lithuania API
 * for KIIS submission/verification today — nothing in this file has been
 * tested against a real endpoint, because no such endpoint exists to test
 * against. What this file IS: the shape a real integration would need,
 * written now so kiisRegulatorReview.service.js (the actual business
 * logic — submit, receive webhook, update status) has something real to
 * call, and so wiring in a genuine API later is a matter of filling in
 * `submitDocument`/`getSubmissionStatus` below and setting env vars, not a
 * redesign of anything that calls this module.
 * ---------------------------------------------------------------------------
 *
 * isEnabled() gates every entry point in kiisRegulatorReview.service.js —
 * exactly the same convention sumsub.service.js already uses. While
 * disabled (the default, and the only possible state until real
 * credentials exist), the admin-facing "submit for regulator review"
 * action runs a sandbox simulator instead of calling anything below.
 */
const isEnabled = () => configenv.BANK_REGULATOR_ENABLED;

/**
 * Submits one KIIS version for review. Real shape TBD by whatever the
 * actual bank API turns out to require (likely: upload the LT original,
 * possibly the translations, plus project/issuer metadata) — this is a
 * placeholder request/response contract, not a verified one.
 *
 * @returns {Promise<{referenceId: string}>}
 */
async function submitDocument({ projectId, versionNumber, files }) {
  if (!isEnabled()) {
    const err = new Error('Bank regulator API is not configured for this environment.');
    err.statusCode = 503;
    throw err;
  }
  // Real implementation goes here once an endpoint exists — e.g.
  // POST `${configenv.BANK_REGULATOR_API_BASE_URL}/kiis/submissions`
  // with BANK_REGULATOR_API_KEY auth and the file(s) attached.
  throw new Error(
    'bankRegulator.service.js#submitDocument has no real implementation yet — ' +
    'BANK_REGULATOR_ENABLED should never be true until this function actually calls a real endpoint.'
  );
}

/**
 * Polling fallback, in case the real API doesn't push a webhook for every
 * status change (or as a manual "check now" action for an admin). Same
 * "not implemented, shape only" caveat as submitDocument above.
 */
async function getSubmissionStatus(referenceId) {
  if (!isEnabled()) {
    const err = new Error('Bank regulator API is not configured for this environment.');
    err.statusCode = 503;
    throw err;
  }
  throw new Error('bankRegulator.service.js#getSubmissionStatus has no real implementation yet.');
}

/**
 * HMAC-SHA256 verification for the inbound webhook — same construction as
 * sumsub.service.js#verifyWebhookSignature. The actual header name and
 * signing scheme are unverified assumptions (a generic `x-signature`
 * header, HMAC over the raw body) until a real integration spec exists;
 * update both this function and the header name read in
 * kiisRegulatorWebhook.controller.js together if the real scheme differs.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!configenv.BANK_REGULATOR_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', configenv.BANK_REGULATOR_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ''));
  } catch (_e) {
    return false;
  }
}

module.exports = {
  isEnabled,
  submitDocument,
  getSubmissionStatus,
  verifyWebhookSignature,
};
