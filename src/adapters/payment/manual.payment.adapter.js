const PaymentAdapterInterface = require('./payment.interface');

/**
 * Used when PAYMENT_PROVIDER/credentials aren't configured — same
 * philosophy as ManualPspAdapter elsewhere in this codebase: not a stub
 * to delete, but what lets the full order → verify → webhook → commission
 * → settlement pipeline be exercised in dev/QA without real gateway
 * credentials. The dev-mode "Pay" button (frontend) generates a
 * `manual_pay_...` id that this adapter recognizes as the SAME code path
 * production signature verification runs.
 */
class ManualPaymentAdapter extends PaymentAdapterInterface {
  async createOrder({ amountPaise, currency, receiptId }) {
    return { providerOrderId: `manual_order_${receiptId}`, raw: { adapter: 'manual', amountPaise, currency } };
  }

  async verifyPaymentSignature({ providerOrderId, providerPaymentId }) {
    return typeof providerOrderId === 'string' && typeof providerPaymentId === 'string' && providerPaymentId.startsWith('manual_pay_');
  }

  async verifyWebhookSignature() {
    return true; // manual mode has no real webhook source
  }

  async fetchPayment(providerPaymentId) {
    return { status: 'captured', method: 'manual', amountPaise: null, raw: { adapter: 'manual', providerPaymentId } };
  }

  async initiateRefund({ amountPaise }) {
    return { providerRefundId: `manual_refund_${Date.now()}`, status: 'processed', raw: { adapter: 'manual', amountPaise } };
  }
}

module.exports = ManualPaymentAdapter;