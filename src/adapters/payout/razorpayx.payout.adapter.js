// RazorpayX (Contacts / Fund Accounts / Fund Account Validation / Payouts).
//
// The `razorpay` npm SDK (2.9.x) does NOT ship RazorpayX resources — there
// is no `client.contacts`, no `client.payouts`, and `client.fundAccount`
// has only create/fetch (no validate). The previous version of this file
// called those non-existent helpers, so every real payout call threw a
// TypeError. These calls now go straight to the documented RazorpayX REST
// endpoints through the SDK's own authenticated axios instance (same host,
// same key_id/key_secret basic auth), which also lets us send the
// X-Payout-Idempotency header the SDK's api.post() cannot pass.
const Razorpay = require('razorpay');
const configenv = require('../../config/env.config');
const PayoutAdapterInterface = require('./payout.interface');

// Maps RazorpayX's validation object to 'active' | 'pending' | 'failed'.
// Validation is ASYNCHRONOUS: creation normally returns status "created",
// and only later becomes "completed" with results.account_status.
function normalizeValidation(validation) {
  const accountStatus = validation?.results?.account_status;
  if (validation?.status === 'completed') return accountStatus === 'active' ? 'active' : 'failed';
  if (validation?.status === 'failed') return 'failed';
  return 'pending';
}

class RazorpayXPayoutAdapter extends PayoutAdapterInterface {
  constructor() {
    super();
    this.client = new Razorpay({ key_id: configenv.PAYMENT_KEY_ID, key_secret: configenv.PAYMENT_KEY_SECRET });
  }

  async request(method, path, data, headers = {}) {
    try {
      const res = await this.client.api.rq.request({ method, url: `/v1${path}`, data, headers });
      return res.data;
    } catch (err) {
      const providerError = err?.response?.data?.error;
      const wrapped = new Error(providerError?.description || err.message || 'RazorpayX request failed');
      wrapped.providerCode = providerError?.code;
      wrapped.statusCode = err?.response?.status;
      throw wrapped;
    }
  }

  async createContact({ name, email, reference }) {
    const contact = await this.request('post', '/contacts', { name, email, type: 'vendor', reference_id: reference });
    return { providerContactId: contact.id };
  }

  async createFundAccount({ providerContactId, accountHolderName, accountNumber, ifsc }) {
    const fundAccount = await this.request('post', '/fund_accounts', {
      contact_id: providerContactId, account_type: 'bank_account',
      bank_account: { name: accountHolderName, ifsc, account_number: accountNumber },
    });
    return { providerFundAccountId: fundAccount.id };
  }

  // Penny-drop validation — a standard bank-account check, distinct from
  // merchant KYC. Debited from the platform's RazorpayX account.
  async validateFundAccount({ providerFundAccountId }) {
    const validation = await this.request('post', '/fund_accounts/validations', {
      account_number: configenv.PAYOUT_ACCOUNT_NUMBER,
      fund_account: { id: providerFundAccountId }, amount: 100, currency: 'INR',
    });
    return { status: normalizeValidation(validation), method: 'penny_drop', validationId: validation.id };
  }

  async fetchFundAccountValidation(validationId) {
    const validation = await this.request('get', `/fund_accounts/validations/${encodeURIComponent(validationId)}`);
    return { status: normalizeValidation(validation), method: 'penny_drop', validationId };
  }

  async createPayout({ providerFundAccountId, amountPaise, currency, idempotencyKey, notes }) {
    const payout = await this.request(
      'post',
      '/payouts',
      { account_number: configenv.PAYOUT_ACCOUNT_NUMBER, fund_account_id: providerFundAccountId, amount: amountPaise, currency, mode: 'IMPS', purpose: 'payout', notes },
      { 'X-Payout-Idempotency': idempotencyKey } // provider-side dedupe on retry
    );
    return { providerPayoutId: payout.id, status: payout.status };
  }

  async fetchPayout(providerPayoutId) {
    const payout = await this.request('get', `/payouts/${encodeURIComponent(providerPayoutId)}`);
    return { status: payout.status, raw: payout };
  }
}
module.exports = RazorpayXPayoutAdapter;
