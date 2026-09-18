const PayoutAdapterInterface = require('./payout.interface');

/**
 * Fallback when PAYOUT_PROVIDER/credentials aren't configured — lets the
 * full bank-link → verify → eligibility → payout pipeline be exercised
 * without RazorpayX credentials, same philosophy as the other manual
 * adapters in this codebase.
 */
class ManualPayoutAdapter extends PayoutAdapterInterface {
  async createContact({ reference }) { return { providerContactId: `manual_contact_${reference}` }; }
  async createFundAccount({ providerContactId }) { return { providerFundAccountId: `manual_fa_${providerContactId}` }; }
  async validateFundAccount() { return { status: 'completed', method: 'manual' }; }
  async createPayout({ idempotencyKey }) { return { providerPayoutId: `manual_payout_${idempotencyKey}`, status: 'processed' }; }
  async fetchPayout(providerPayoutId) { return { status: 'processed', raw: { adapter: 'manual', providerPayoutId } }; }
}
module.exports = ManualPayoutAdapter;