const mongoose = require('mongoose');
const crypto = require('crypto');
const paymentModel = require('../../model/payment.model');
const paymentWebhookEventModel = require('../../model/paymentWebhookEvent.model');
const transactionModel = require('../../model/transaction.model');
const payoutModel = require('../../model/payout.model');
const deleteConstants = require('../../constants/delete.constants');
const { PAYMENT_STATES } = require('../../constants/payment.constants');
const { TRANSACTION_STATES, COMMISSION_STATES } = require('../../constants/transaction.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');
const { toPaise } = require('../../helper/money.helper');
const configenv = require('../../config/env.config');
const { getPaymentAdapter, getManualTestPaymentAdapter } = require('../../config/integrations.config');
const transactionService = require('./transaction.service');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
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
async function loadPayableTransaction(transactionId, buyerId) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new PaymentError('Invalid transaction id', 404);
  const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
  if (!txn) throw new PaymentError('Transaction not found', 404);
  if (String(txn.buyer) !== String(buyerId)) throw new PaymentError('You are not the buyer on this transaction', 403);
  if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
    throw new PaymentError(`Cannot pay for a transaction in status ${txn.status}`, 409);
  }
  return txn;
}

async function createPaymentOrder({ transactionId, buyerId, req }) {
  const txn = await loadPayableTransaction(transactionId, buyerId);

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

  let payment;
  try {
    payment = await paymentModel.create({
      transaction: txn._id, buyer: txn.buyer, seller: txn.seller,
      provider: configenv.PAYMENT_PROVIDER || 'manual',
      providerOrderId, amountPaise, currency: 'INR',
      status: PAYMENT_STATES.CREATED,
      history: [{ action: 'ORDER_CREATED', note: JSON.stringify({ raw: raw?.id || null }) }],
    });
  } catch (err) {
    // Partial unique index on {transaction, status: active} (payment.schema.js)
    // means a near-simultaneous double-click loses the create race here
    // instead of leaving two live orders against the gateway — fall back
    // to whichever order won.
    if (err.code === 11000) {
      const winner = await paymentModel.findOne({
        transaction: txn._id,
        status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
        is_deleted: deleteConstants.NOT_DELETED,
      });
      if (winner) return buildOrderResponse(winner, txn);
    }
    throw err;
  }
  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.PAYMENT_ORDER_CREATED, entity: 'payments', entityId: payment._id });
  return buildOrderResponse(payment, txn);
}

// Dev/QA-only simulated success — see spec "MANUAL PAYMENT" sections.
// Gated by ENABLE_MANUAL_PAYMENT_TEST (hard-false in production regardless
// of the env var). Never trusts anything from the client: amount is
// re-derived from the transaction snapshot, and the "provider payment id"
// is generated server-side, so there is no client-suppliable value that
// could forge a successful payment — the only trust boundary is the
// authenticated buyer-ownership check plus the environment flag.
async function createManualTestPayment({ transactionId, buyerId, req }) {
  if (!configenv.ENABLE_MANUAL_PAYMENT_TEST) {
    throw new PaymentError('Manual test payment is disabled', 404);
  }
  const txn = await loadPayableTransaction(transactionId, buyerId);

  let payment = await paymentModel.findOne({
    transaction: txn._id,
    status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
    is_deleted: deleteConstants.NOT_DELETED,
  });

  if (!payment) {
    const amountPaise = toPaise(txn.agreedAmount);
    const adapter = getManualTestPaymentAdapter();
    const { providerOrderId } = await adapter.createOrder({ amountPaise, currency: 'INR', receiptId: String(txn._id) });
    try {
      payment = await paymentModel.create({
        transaction: txn._id, buyer: txn.buyer, seller: txn.seller,
        provider: 'manual', providerOrderId, amountPaise, currency: 'INR',
        status: PAYMENT_STATES.CREATED,
        history: [{ action: 'MANUAL_TEST_ORDER_CREATED' }],
      });
    } catch (err) {
      if (err.code === 11000) {
        payment = await paymentModel.findOne({
          transaction: txn._id,
          status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
          is_deleted: deleteConstants.NOT_DELETED,
        });
      }
      if (!payment) throw err;
    }
  }

  const providerPaymentId = `manual_pay_${crypto.randomUUID()}`;
  const confirmed = await confirmPaymentSuccess({ payment, providerPaymentId, method: 'manual_test', req });
  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.MANUAL_TEST_PAYMENT_CONFIRMED, entity: 'payments', entityId: confirmed._id, metadata: { transactionId: String(txn._id), amountPaise: confirmed.amountPaise } });
  return confirmed;
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
    await createAuditLog({ req, userId: buyerId, action: auditLogConstants.PAYMENT_VERIFICATION_FAILED, entity: 'payments', entityId: payment._id });
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
    await notificationService.createNotification({
    recipientId: fresh.buyer, type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
    title: 'Payment successful', message: `Your payment of ₹${(fresh.amountPaise / 100).toLocaleString('en-IN')} was confirmed`,
    entityType: 'transaction', entityId: fresh.transaction,
  });
  await notificationService.createNotification({
    recipientId: fresh.seller, type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
    title: 'Payment received', message: 'Buyer has paid — please proceed with handover', entityType: 'transaction', entityId: fresh.transaction,
  });
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

 const failedPayment = await paymentModel.findOne({
    providerOrderId: entity.order_id
  });

  if (failedPayment) {
    await notificationService.createNotification({
      recipientId: failedPayment.buyer,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      title: 'Payment failed',
      message: entity.error_description || 'Your payment could not be completed',
      entityType: 'transaction',
      entityId: failedPayment.transaction,
    });
  }
  } else if (eventType === 'refund.processed') {
    const payment = await paymentModel.findOne({ providerPaymentId: entity.payment_id });
    // Idempotency: a second refund.processed for an already-REFUNDED
    // payment (e.g. webhook redelivery) is a no-op rather than pushing a
    // duplicate refund record and re-touching the transaction.
    if (payment && payment.status !== PAYMENT_STATES.REFUNDED) {
      const fullyRefunded = entity.amount >= payment.amountPaise;
      payment.status = fullyRefunded ? PAYMENT_STATES.REFUNDED : PAYMENT_STATES.PARTIALLY_REFUNDED;
      payment.refunds.push({ providerRefundId: entity.id, amountPaise: entity.amount, status: 'processed' });
      await payment.save();
      await createAuditLog({ userId: payment.buyer, action: auditLogConstants.REFUND_INITIATED, entity: 'payments', entityId: payment._id, metadata: { providerRefundId: entity.id, amountPaise: entity.amount, fullyRefunded } });

      if (fullyRefunded) {
        const txn = await transactionModel.findById(payment.transaction);
        // Guarded, not a blind updateOne: never re-stamp a transaction
        // that's already REFUNDED (idempotent), and leave a reconciliation
        // trail rather than silently overwriting a COMPLETED/DISPUTED one.
        if (txn && txn.status !== TRANSACTION_STATES.REFUNDED) {
          const payout = await payoutModel.findOne({ transaction: txn._id });
          const alreadySettled = payout && payout.status === PAYOUT_STATES.PAID;
          const previousStatus = txn.status;
          txn.status = TRANSACTION_STATES.REFUNDED;
          // Leave a SETTLED commission ledger alone if the seller was
          // already paid before this refund landed — that mismatch is
          // exactly what needs admin reconciliation, not a silent flip.
          if (!alreadySettled) txn.commissionStatus = COMMISSION_STATES.REFUNDED;
          txn.history.push({
            action: 'REFUNDED', by: 'system',
            note: alreadySettled
              ? `Refunded by provider after seller payout was already PAID (was ${previousStatus}) — needs admin reconciliation`
              : `Refunded by provider (was ${previousStatus})`,
          });
          await txn.save();
        }
      }
    }
  }
  return { processed: true, eventType };
}

// Admin-triggered refund — calls the real provider refund API (never a
// bare DB-field flip, per spec "DO NOT FAKE REFUNDS"). The payment/
// transaction only actually flip to REFUNDED once the provider confirms
// via the refund.processed webhook above; this just authorizes and starts
// that process and records who did it.
async function initiateAdminRefund({ paymentId, adminId, reason, req }) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new PaymentError('Invalid payment id', 404);
  const payment = await paymentModel.findOne({ _id: paymentId, is_deleted: deleteConstants.NOT_DELETED });
  if (!payment) throw new PaymentError('Payment not found', 404);
  if (![PAYMENT_STATES.SUCCESS, PAYMENT_STATES.PARTIALLY_REFUNDED].includes(payment.status)) {
    throw new PaymentError(`Cannot refund a payment in status ${payment.status}`, 409);
  }
  if (payment.provider === 'manual') {
    throw new PaymentError('Manual test payments have no real provider transaction to refund', 409);
  }

  const adapter = getPaymentAdapter();
  const { providerRefundId, status } = await adapter.initiateRefund({
    providerPaymentId: payment.providerPaymentId, amountPaise: payment.amountPaise, notes: { reason: reason || '' },
  });

  payment.refunds.push({ providerRefundId, amountPaise: payment.amountPaise, status: status || 'initiated', initiatedByAdminId: adminId });
  payment.history.push({ action: 'REFUND_REQUESTED_BY_ADMIN', note: reason || '' });
  await payment.save();
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.REFUND_INITIATED, entity: 'payments', entityId: payment._id, metadata: { providerRefundId, reason } });
  return payment;
}

module.exports = { PaymentError, createPaymentOrder, createManualTestPayment, verifyPayment, handleWebhook, initiateAdminRefund };