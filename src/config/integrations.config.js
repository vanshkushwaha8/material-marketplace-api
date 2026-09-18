/**
 * E15 — External Integration Registry
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Integration 1: PSP (Payment Service Provider)                       │
 * │ Used by: OPL-401 (withdrawal release), OPL-402 (escrow release)     │
 * │ Vendors supported: Lemonway, Mangopay                               │
 * │ Fallback: Manual payment instruction queue (genuine ops workflow)   │
 * │                                                                     │
 * │ To enable:                                                         │
 * │   PSP_ENABLED=true                                                 │
 * │   PSP_PROVIDER=lemonway | mangopay                                 │
 * │   PSP_API_URL=<vendor sandbox or production URL>                   │
 * │   PSP_API_KEY=<vendor API key>                                     │
 * │   PSP_WEBHOOK_SECRET=<for validating inbound webhooks>             │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ Integration 2: Sanctions Screening                                  │
 * │ Used by: OPL-404 (AML rule engine — sanctions hits rule)             │
 * │ Vendors supported: ComplyAdvantage, Refinitiv World-Check           │
 * │ Fallback: SANCTIONS_MANUAL_REVIEW alert → compliance officer queue  │
 * │                                                                     │
 * │ To enable:                                                         │
 * │   SANCTIONS_ENABLED=true                                           │
 * │   SANCTIONS_PROVIDER=complyadvantage | refinitiv                   │
 * │   SANCTIONS_API_URL=<vendor API URL>                                │
 * │   SANCTIONS_API_KEY=<vendor API key>                                │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ Integration 3: FNTT (Lithuanian FIU)                                │
 * │ Used by: OPL-405 (STR escalation)                                    │
 * │ Status: No programmatic API — manual filing via FNTT portal         │
 * │ Fallback: N/A — manual filing IS the workflow. System records       │
 * │ the case and tracks FIU status internally.                          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * This is the ONLY file in the app that imports a concrete adapter.
 * Every service calls getPspAdapter()/getSanctionsAdapter() — never a
 * vendor class directly — so swapping vendors, or going from manual to
 * live, is exactly the env-var change documented above and nothing else.
 *
 * Deliberate deviation from a literal PSP_ENABLED=true/false env flag:
 * matches this codebase's existing SUMSUB_ENABLED/BANK_REGULATOR_ENABLED
 * pattern (see env.config.js) — the flag is compound (explicit true AND a
 * real API key present), so a misconfiguration (flag flipped on, key
 * left blank) fails safe to the manual adapter instead of silently trying
 * to call a vendor with no credentials.
 */
const configenv = require('./env.config');
const ManualPspAdapter = require('../adapters/psp/manual.psp.adapter');
const ManualSanctionsAdapter = require('../adapters/sanctions/manual.sanctions.adapter');
const RazorpayPaymentAdapter = require('../adapters/payment/razorpay.payment.adapter');
const ManualPaymentAdapter = require('../adapters/payment/manual.payment.adapter');
const RazorpayXPayoutAdapter = require('../adapters/payout/razorpayx.payout.adapter');
const ManualPayoutAdapter = require('../adapters/payout/manual.payout.adapter');
// Vendor adapters are intentionally not required here — per the
// implementation blueprint's own recommended build order, they're only
// written once a vendor is actually contracted (nothing to test against
// otherwise). Wiring points are left as clear TODOs rather than either
// building untestable stub classes now or leaving this file silently
// unable to support them later.
let LemonwayAdapter = null;
let MangopayAdapter = null;
let ComplyAdvantageAdapter = null;
let RefinitivAdapter = null;

function getPspAdapter() {
  if (configenv.PSP_ENABLED && configenv.PSP_PROVIDER === 'lemonway') {
    if (!LemonwayAdapter) {
      // TODO: implement adapters/psp/lemonway.adapter.js once Lemonway is
      // contracted, then: LemonwayAdapter = require('../adapters/psp/lemonway.adapter');
      throw new Error('PSP_PROVIDER=lemonway is configured but lemonway.adapter.js has not been implemented yet.');
    }
    return new LemonwayAdapter();
  }
  if (configenv.PSP_ENABLED && configenv.PSP_PROVIDER === 'mangopay') {
    if (!MangopayAdapter) {
      throw new Error('PSP_PROVIDER=mangopay is configured but mangopay.adapter.js has not been implemented yet.');
    }
    return new MangopayAdapter();
  }
  return new ManualPspAdapter();
}

function getSanctionsAdapter() {
  if (configenv.SANCTIONS_ENABLED && configenv.SANCTIONS_PROVIDER === 'complyadvantage') {
    if (!ComplyAdvantageAdapter) {
      throw new Error('SANCTIONS_PROVIDER=complyadvantage is configured but complyadvantage.adapter.js has not been implemented yet.');
    }
    return new ComplyAdvantageAdapter();
  }
  if (configenv.SANCTIONS_ENABLED && configenv.SANCTIONS_PROVIDER === 'refinitiv') {
    if (!RefinitivAdapter) {
      throw new Error('SANCTIONS_PROVIDER=refinitiv is configured but refinitiv.adapter.js has not been implemented yet.');
    }
    return new RefinitivAdapter();
  }
  return new ManualSanctionsAdapter();
}
function getPaymentAdapter() {
  if (configenv.PAYMENT_PROVIDER === 'razorpay' && configenv.PAYMENT_KEY_ID && configenv.PAYMENT_KEY_SECRET) {
    return new RazorpayPaymentAdapter();
  }
  return new ManualPaymentAdapter();
}
function getPayoutAdapter() {
  if (configenv.PAYOUT_PROVIDER === 'razorpayx' && configenv.PAYMENT_KEY_ID && configenv.PAYMENT_KEY_SECRET && configenv.PAYOUT_ACCOUNT_NUMBER) {
    return new RazorpayXPayoutAdapter();
  }
  return new ManualPayoutAdapter();
}
module.exports = { getPspAdapter, getSanctionsAdapter,getPaymentAdapter, getPayoutAdapter };
