// Requires: npm install razorpay (same SDK covers RazorpayX's contacts/
// fund_accounts/payouts endpoints once RazorpayX is enabled on the account)
const Razorpay = require('razorpay');
const configenv = require('../../config/env.config');
const PayoutAdapterInterface = require('./payout.interface');

class RazorpayXPayoutAdapter extends PayoutAdapterInterface {
  constructor() {
    super();
    this.client = new Razorpay({ key_id: configenv.PAYMENT_KEY_ID, key_secret: configenv.PAYMENT_KEY_SECRET });
  }

  async createContact({ name, email, reference }) {
    const contact = await this.client.contacts.create({ name, email, type: 'vendor', reference_id: reference });
    return { providerContactId: contact.id };
  }

  async createFundAccount({ providerContactId, accountHolderName, accountNumber, ifsc }) {
    const fundAccount = await this.client.fundAccount.create({
      contact_id: providerContactId, account_type: 'bank_account',
      bank_account: { name: accountHolderName, ifsc, account_number: accountNumber },
    });
    return { providerFundAccountId: fundAccount.id };
  }

  // Penny-drop validation — RazorpayX's Fund Account Validation API. A
  // standard bank-account check, distinct from merchant KYC.
  async validateFundAccount({ providerFundAccountId }) {
    const validation = await this.client.fundAccount.validate({
      fund_account: { id: providerFundAccountId }, amount: 100, currency: 'INR',
    });
    return { status: validation.results?.account_status || validation.status, method: 'penny_drop' };
  }

  async createPayout({ providerFundAccountId, amountPaise, currency, idempotencyKey, notes }) {
    const payout = await this.client.payouts.create(
      { account_number: configenv.PAYOUT_ACCOUNT_NUMBER, fund_account_id: providerFundAccountId, amount: amountPaise, currency, mode: 'IMPS', purpose: 'payout', notes },
      { 'X-Payout-Idempotency': idempotencyKey } // provider-side dedupe on retry
    );
    return { providerPayoutId: payout.id, status: payout.status };
  }

  async fetchPayout(providerPayoutId) {
    const payout = await this.client.payouts.fetch(providerPayoutId);
    return { status: payout.status, raw: payout };
  }
}
module.exports = RazorpayXPayoutAdapter;