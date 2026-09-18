/**
 * Contract every payment adapter must implement. Only
 * integrations.config.js#getPaymentAdapter() instantiates a concrete
 * one — services never import razorpay.payment.adapter.js directly,
 * matching the existing psp.interface.js convention in this codebase.
 *
 * createOrder({ amountPaise, currency, receiptId, notes })
 *   returns: { providerOrderId, raw }
 * verifyPaymentSignature({ providerOrderId, providerPaymentId, signature })
 *   returns: boolean
 * verifyWebhookSignature({ rawBody, signature })
 *   returns: boolean
 * fetchPayment(providerPaymentId)
 *   returns: { status, method, amountPaise, raw }
 * initiateRefund({ providerPaymentId, amountPaise, notes })
 *   returns: { providerRefundId, status, raw }
 */
class PaymentAdapterInterface {
  async createOrder(_payload) { throw new Error('createOrder() not implemented'); }
  async verifyPaymentSignature(_payload) { throw new Error('verifyPaymentSignature() not implemented'); }
  async verifyWebhookSignature(_payload) { throw new Error('verifyWebhookSignature() not implemented'); }
  async fetchPayment(_providerPaymentId) { throw new Error('fetchPayment() not implemented'); }
  async initiateRefund(_payload) { throw new Error('initiateRefund() not implemented'); }
}

module.exports = PaymentAdapterInterface;