// Requires: npm install razorpay
const crypto = require('crypto');
const Razorpay = require('razorpay');
const configenv = require('../../config/env.config');
const PaymentAdapterInterface = require('./payment.interface');

class RazorpayPaymentAdapter extends PaymentAdapterInterface {
  constructor() {
    super();
    this.client = new Razorpay({ key_id: configenv.PAYMENT_KEY_ID, key_secret: configenv.PAYMENT_KEY_SECRET });
  }

  async createOrder({ amountPaise, currency, receiptId, notes }) {
    // Razorpay's `amount` is already the smallest currency unit (paise).
    // payment_capture: 1 auto-captures on success; funds still route into
    // the platform's Razorpay account per PAYMENT_MODE/Route configuration,
    // NOT instantly to the seller — that's the escrow-equivalent behavior.
    const order = await this.client.orders.create({
      amount: amountPaise, currency, receipt: receiptId, notes, payment_capture: 1,
    });
    return { providerOrderId: order.id, raw: order };
  }

  async verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
    const expected = crypto
      .createHmac('sha256', configenv.PAYMENT_KEY_SECRET)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
    return expected === signature;
  }

  async verifyWebhookSignature({ rawBody, signature }) {
    const expected = crypto
      .createHmac('sha256', configenv.PAYMENT_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return expected === signature;
  }

  async fetchPayment(providerPaymentId) {
    const payment = await this.client.payments.fetch(providerPaymentId);
    return { status: payment.status, method: payment.method, amountPaise: payment.amount, raw: payment };
  }

  async initiateRefund({ providerPaymentId, amountPaise, notes }) {
    const refund = await this.client.payments.refund(providerPaymentId, { amount: amountPaise, notes });
    return { providerRefundId: refund.id, status: refund.status, raw: refund };
  }
}

module.exports = RazorpayPaymentAdapter;