/**
 * Contract every payout adapter must implement. Only
 * integrations.config.js#getPayoutAdapter() instantiates a concrete one.
 * Kept separate from payment.interface.js because bank-account
 * verification + payouts (RazorpayX) is a distinct product from order
 * checkout (Razorpay Payments), even under the same provider.
 *
 * createContact({ name, email, reference })                          -> { providerContactId }
 * createFundAccount({ providerContactId, accountHolderName, accountNumber, ifsc })
 *                                                                     -> { providerFundAccountId }
 * validateFundAccount({ providerFundAccountId })                     -> { status, method }
 * createPayout({ providerFundAccountId, amountPaise, currency, idempotencyKey, notes })
 *                                                                     -> { providerPayoutId, status }
 * fetchPayout(providerPayoutId)                                      -> { status, raw }
 */
class PayoutAdapterInterface {
  async createContact(_p) { throw new Error('createContact() not implemented'); }
  async createFundAccount(_p) { throw new Error('createFundAccount() not implemented'); }
  async validateFundAccount(_p) { throw new Error('validateFundAccount() not implemented'); }
  async createPayout(_p) { throw new Error('createPayout() not implemented'); }
  async fetchPayout(_providerPayoutId) { throw new Error('fetchPayout() not implemented'); }
}
module.exports = PayoutAdapterInterface;