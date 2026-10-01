// Requires: npm install razorpay
const crypto = require('crypto');
const Razorpay = require('razorpay');
const configenv = require('../../config/env.config');
const PaymentAdapterInterface = require('./payment.interface');

// Constant-time HMAC comparison — `===` on hex strings leaks how many
// leading characters matched through response timing.
function safeEqualHex(expected, received) {
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}

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
    return safeEqualHex(expected, signature);
  }

  // Razorpay signs each webhook with that webhook's own secret. Payment
  // events use PAYMENT_WEBHOOK_SECRET; RazorpayX payout events may be set up
  // as a separate webhook with PAYOUT_WEBHOOK_SECRET (optional). No secret
  // configured = no way to authenticate the sender: reject rather than HMAC
  // with an empty key anyone could reproduce.
  async verifyWebhookSignature({ rawBody, signature }) {
    if (!rawBody || typeof signature !== 'string') return false;
    const secrets = [configenv.PAYMENT_WEBHOOK_SECRET, configenv.PAYOUT_WEBHOOK_SECRET].filter(Boolean);
    return secrets.some((secret) => {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return safeEqualHex(expected, signature);
    });
  }

  async fetchPayment(providerPaymentId) {
    const payment = await this.client.payments.fetch(providerPaymentId);
    return {
      status: payment.status, method: payment.method, amountPaise: payment.amount,
      currency: payment.currency, orderId: payment.order_id, raw: payment,
    };
  }

  // `receipt` is unique per refund attempt (refund.service.js) so a retried
  // HTTP request for the same attempt is recognisable at the provider.
  async initiateRefund({ providerPaymentId, amountPaise, receipt, notes }) {
    const refund = await this.client.payments.refund(providerPaymentId, {
      amount: amountPaise, speed: 'normal', ...(receipt ? { receipt } : {}), notes,
    });
    return { providerRefundId: refund.id, status: refund.status, raw: refund };
  }

  async fetchRefund({ providerPaymentId, providerRefundId }) {
    const refund = providerPaymentId
      ? await this.client.payments.fetchRefund(providerPaymentId, providerRefundId)
      : await this.client.refunds.fetch(providerRefundId);
    return { status: refund.status, amountPaise: refund.amount, raw: refund };
  }
}

module.exports = RazorpayPaymentAdapter;