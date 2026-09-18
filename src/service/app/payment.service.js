const mongoose = require('mongoose');
const paymentModel = require('../../model/payment.model');
const paymentWebhookEventModel = require('../../model/paymentWebhookEvent.model');
const transactionModel = require('../../model/transaction.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYMENT_STATES } = require('../../constants/payment.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const { toPaise } = require('../../helper/money.helper');
const configenv = require('../../config/env.config');
const { getPaymentAdapter } = require('../../config/integrations.config');
const transactionService = require('./transaction.service');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = statusCode;
  }
}

// Buyer clicks "Proceed to Payment". Backend computes the authoritative
// amount from the transaction snapshot — never from anything the
// frontend sends — and asks the provider for an order. Idempotent: a
// retry before any terminal payment exists reuses the same order instead
// of creating a duplicate one against the gateway.
async function createPaymentOrder({ transactionId, buyerId, req }) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new PaymentError('Invalid transaction id', 404);
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new PaymentError('Transaction not found', 404);
  if (String(txn.buyer) !== String(buyerId)) throw new PaymentError('You are not the buyer on this transaction', 403);
  if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
    throw new PaymentError(`Cannot pay for a transaction in status ${txn.status}`, 409);
  }

  const existing = await paymentModel.findOne({
    transaction: txn._id,
    status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (existing) {
    return buildOrderResponse(existing, txn);
  }

  const amountPaise = toPaise(txn.agreedAmount);
  const adapter = getPaymentAdapter();
  const { providerOrderId, raw } = await adapter.createOrder({
    amountPaise, currency: 'INR', receiptId: String(txn._id),
    notes: { transactionId: String(txn._id), listingId: String(txn.listing) },
  });

  const payment = await paymentModel.create({
    transaction: txn._id, buyer: txn.buyer, seller: txn.seller,
    provider: configenv.PAYMENT_PROVIDER || 'manual',
    providerOrderId, amountPaise, currency: 'INR',
    status: PAYMENT_STATES.CREATED,
    history: [{ action: 'ORDER_CREATED', note: JSON.stringify({ raw: raw?.id || null }) }],
  });
  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.PAYMENT_ORDER_CREATED, entity: 'payments', entityId: payment._id });
  return buildOrderResponse(payment, txn);
}

function buildOrderResponse(payment, txn) {
  return {
    paymentId: payment._id,
    providerOrderId: payment.providerOrderId,
    provider: payment.provider,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    keyId: configenv.PAYMENT_KEY_ID || null, // public key id — safe to expose to the checkout widget
    breakdown: {
      material: undefined, // populated by the controller if needed via txn.listing
      quantity: txn.agreedQuantity,
      unitPrice: txn.unitPrice,
      totalPayable: txn.agreedAmount,
    },
  };
}

// Called from the buyer's checkout-callback (immediate UX) AND from the
// webhook (authoritative, in case the callback never fires) — both paths
// converge here so there is exactly one place that flips a payment to
// SUCCESS and advances the transaction.
async function verifyPayment({ buyerId, providerOrderId, providerPaymentId, signature, req }) {
  const payment = await paymentModel.findOne({ providerOrderId, is_deleted: deleteConstants.NOT_DELETED });
  if (!payment) throw new PaymentError('Payment order not found', 404);
  if (String(payment.buyer) !== String(buyerId)) throw new PaymentError('You are not the buyer on this payment', 403);

  if (payment.status === PAYMENT_STATES.SUCCESS) {
    return { payment, alreadyProcessed: true }; // idempotent — buyer's browser retried the callback
  }

  const adapter = getPaymentAdapter();
  const valid = await adapter.verifyPaymentSignature({ providerOrderId, providerPaymentId, signature });
  if (!valid) {
    payment.status = PAYMENT_STATES.FAILED;
    payment.failureReason = 'Signature verification failed';
    payment.history.push({ action: 'VERIFY_FAILED' });
    await payment.save();
    throw new PaymentError('Payment verification failed', 400);
  }

  await confirmPaymentSuccess({ payment, providerPaymentId, req });
  return { payment, alreadyProcessed: false };
}

// Single idempotent transition to SUCCESS — safe to call twice (webhook +
// callback both racing) because it re-checks status under the payment's
// own document before doing anything.
async function confirmPaymentSuccess({ payment, providerPaymentId, method, req }) {
  const fresh = await paymentModel.findById(payment._id);
  if (fresh.status === PAYMENT_STATES.SUCCESS) return fresh; // already handled by the other path

  fresh.providerPaymentId = providerPaymentId;
  fresh.status = PAYMENT_STATES.SUCCESS;
  if (method) fresh.method = method;
  fresh.history.push({ action: 'PAYMENT_SUCCESS' });
  await fresh.save();

  await transactionService.markPaymentConfirmed({ transactionId: fresh.transaction, req });
  await createAuditLog({ req, userId: fresh.buyer, action: auditLogConstants.PAYMENT_CONFIRMED, entity: 'payments', entityId: fresh._id });
  return fresh;
}

// Webhooks are the ONLY source of truth allowed to move money-adjacent
// state without an authenticated buyer request — signature-verified,
// idempotent via the unique (provider,eventId) index below.
async function handleWebhook({ rawBody, signature, payload }) {
  const adapter = getPaymentAdapter();
  const validSignature = await adapter.verifyWebhookSignature({ rawBody, signature });
  if (!validSignature) throw new PaymentError('Invalid webhook signature', 401);

  const eventId = payload.id || payload.event_id;
  const eventType = payload.event;
  try {
    await paymentWebhookEventModel.create({ provider: configenv.PAYMENT_PROVIDER || 'manual', eventId, eventType, payload });
  } catch (err) {
    if (err.code === 11000) return { duplicate: true }; // already processed — ack without reprocessing
    throw err;
  }

  const entity = payload.payload?.payment?.entity || payload.payload?.refund?.entity;
  if (!entity) return { ignored: true };

  if (eventType === 'payment.captured') {
    const payment = await paymentModel.findOne({ providerOrderId: entity.order_id });
    if (payment) await confirmPaymentSuccess({ payment, providerPaymentId: entity.id, method: entity.method });
  } else if (eventType === 'payment.failed') {
    await paymentModel.updateOne(
      { providerOrderId: entity.order_id, status: { $ne: PAYMENT_STATES.SUCCESS } },
      { $set: { status: PAYMENT_STATES.FAILED, failureReason: entity.error_description || 'Payment failed at provider' }, $push: { history: { action: 'PAYMENT_FAILED_WEBHOOK' } } }
    );
  } else if (eventType === 'refund.processed') {
    const payment = await paymentModel.findOne({ providerPaymentId: entity.payment_id });
    if (payment) {
      const fullyRefunded = entity.amount >= payment.amountPaise;
      payment.status = fullyRefunded ? PAYMENT_STATES.REFUNDED : PAYMENT_STATES.PARTIALLY_REFUNDED;
      payment.refunds.push({ providerRefundId: entity.id, amountPaise: entity.amount, status: 'processed' });
      await payment.save();
      if (fullyRefunded) {
        await transactionModel.updateOne({ _id: payment.transaction }, { $set: { status: TRANSACTION_STATES.REFUNDED } });
      }
    }
  }
  return { processed: true, eventType };
}

module.exports = { PaymentError, createPaymentOrder, verifyPayment, handleWebhook };