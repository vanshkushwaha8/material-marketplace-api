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
const { toPaise, payableAmount } = require('../../helper/money.helper');
const configenv = require('../../config/env.config');
const { getPaymentAdapter, getManualTestPaymentAdapter } = require('../../config/integrations.config');
const transactionService = require('./transaction.service');
const deliveryQuoteService = require('./deliveryQuote.service');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { notifyAdmins } = require('../admin/adminNotification.service');
const escrow = require('./escrow.service');
const { ESCROW_STATES, ESCROW_ACTORS, ESCROW_TRANSITIONS } = require('../../constants/escrow.constants');

// Escrow side-effects of payment attempts. Never throw into the payment
// flow: an escrow already past these states (e.g. PAID) simply ignores them.
const escrowSafe = (args) => escrow.transition(args).catch((err) => {
  if (!(err instanceof escrow.EscrowTransitionError)) console.error('[payment] escrow update failed:', err.message);
  return null;
});

// Webhook payloads are kept for audit/reconciliation, minus buyer PII and
// payment-instrument details (cards, UPI ids, bank accounts, contact info).
const REDACT_KEYS = new Set(['email', 'contact', 'card', 'vpa', 'bank', 'wallet', 'upi', 'acquirer_data', 'customer_details', 'bank_account', 'fund_account']);
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACT_KEYS.has(k) ? '[redacted]' : redact(v)]));
  }
  return value;
}
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
  if (String(txn.buyer) !== String(buyerId)) throw new PaymentError('Transaction not found', 404); // ownership: not revealed
  if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
    throw new PaymentError(`Cannot pay for a transaction in status ${txn.status}`, 409);
  }
  // Every order (Buy Now or accepted offer) must say how the material
  // reaches the buyer before any money moves — set on the checkout page via
  // PATCH …/fulfilment.
  if (!txn.fulfilment?.method) {
    const err = new PaymentError('Choose delivery or pickup before paying', 409);
    err.code = 'FULFILMENT_REQUIRED';
    throw err;
  }
  // Delivery is payable only once the buyer accepted the seller's quote, so
  // the amount charged is always one the buyer agreed to.
  if (!deliveryQuoteService.readyForPayment(txn)) {
    const err = new PaymentError('Delivery isn\'t agreed yet: wait for the seller\'s quote, then accept it on the checkout page', 409);
    err.code = 'DELIVERY_QUOTE_PENDING';
    throw err;
  }
  return txn;
}

async function createPaymentOrder({ transactionId, buyerId, req }) {
  const txn = await loadPayableTransaction(transactionId, buyerId);
  await escrowSafe({ transactionId: txn._id, action: 'START_PAYMENT', actor: { type: ESCROW_ACTORS.BUYER, id: buyerId }, amount: payableAmount(txn), req });

  const existing = await paymentModel.findOne({
    transaction: txn._id,
    status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (existing) {
    if (existing.amountPaise === toPaise(payableAmount(txn))) return buildOrderResponse(existing, txn);
    // Opened before the total changed (delivery chosen at checkout). Only a
    // never-started order can be dropped; one mid-payment must finish first.
    if (existing.status !== PAYMENT_STATES.CREATED) {
      throw new PaymentError('A payment for this order is already in progress — wait for it to finish', 409);
    }
    await paymentModel.updateOne(
      { _id: existing._id, status: PAYMENT_STATES.CREATED },
      { $set: { status: PAYMENT_STATES.CANCELLED, failureReason: 'Order total changed' }, $push: { history: { action: 'CANCELLED_TOTAL_CHANGED' } } }
    );
  }

  const amountPaise = toPaise(payableAmount(txn)); // product price + convenience fee + delivery
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
  // Same escrow steps as the real checkout (INITIATED → PROCESSING → PAID).
  await escrowSafe({ transactionId: txn._id, action: 'START_PAYMENT', actor: { type: ESCROW_ACTORS.BUYER, id: buyerId }, amount: payableAmount(txn), req });

  let payment = await paymentModel.findOne({
    transaction: txn._id,
    status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
    is_deleted: deleteConstants.NOT_DELETED,
  });
  // Same rule as createPaymentOrder: an order opened at an older total is
  // dropped (if never started) rather than paid at the wrong amount.
  if (payment && payment.amountPaise !== toPaise(payableAmount(txn))) {
    if (payment.status !== PAYMENT_STATES.CREATED) throw new PaymentError('A payment for this order is already in progress — wait for it to finish', 409);
    await paymentModel.updateOne(
      { _id: payment._id, status: PAYMENT_STATES.CREATED },
      { $set: { status: PAYMENT_STATES.CANCELLED, failureReason: 'Order total changed' }, $push: { history: { action: 'CANCELLED_TOTAL_CHANGED' } } }
    );
    payment = null;
  }

  if (!payment) {
    const amountPaise = toPaise(payableAmount(txn)); // product price + convenience fee + delivery
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
      productAmount: txn.agreedAmount,
      convenienceFeePct: txn.buyerFeePct || 0,
      convenienceFee: txn.buyerFeeAmount || 0,
      deliveryCharge: txn.deliveryCharge || 0,
      totalPayable: payableAmount(txn),
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
  if (String(payment.buyer) !== String(buyerId)) throw new PaymentError('Payment order not found', 404); // ownership: not revealed

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
    await escrowSafe({ transactionId: payment.transaction, action: 'PAYMENT_FAILED', actor: { type: ESCROW_ACTORS.SYSTEM }, reason: 'Payment signature verification failed', req });
    await createAuditLog({ req, userId: buyerId, action: auditLogConstants.PAYMENT_VERIFICATION_FAILED, entity: 'payments', entityId: payment._id });
    throw new PaymentError('Payment verification failed', 400);
  }

  // The signature only proves "this payment id belongs to this order". Ask
  // the provider what was actually captured before touching any state —
  // the frontend is never authoritative for money.
  const providerPayment = await adapter.fetchPayment(providerPaymentId);
  const mismatch = describeCaptureMismatch(payment, {
    orderId: providerPayment.orderId, amountPaise: providerPayment.amountPaise, currency: providerPayment.currency,
  });
  if (mismatch) {
    await flagForReconciliation(payment._id, mismatch, req);
    throw new PaymentError('Payment could not be matched to this order — our team has been notified', 409);
  }
  const providerStatus = String(providerPayment.status || '').toLowerCase();
  if (providerStatus === 'authorized') {
    // Money authorised but not captured yet — the payment.captured webhook
    // completes it. Not a failure; the transaction just isn't paid yet.
    const processing = await paymentModel.findOneAndUpdate(
      { _id: payment._id, status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING] } },
      { $set: { status: PAYMENT_STATES.PROCESSING, providerPaymentId }, $push: { history: { action: 'AUTHORIZED_AWAITING_CAPTURE' } } },
      { new: true }
    );
    return { payment: processing || await paymentModel.findById(payment._id), alreadyProcessed: false, awaitingCapture: true };
  }
  if (providerStatus !== 'captured') {
    throw new PaymentError(`Payment is not complete (provider status: ${providerStatus || 'unknown'})`, 409);
  }

  const confirmed = await confirmPaymentSuccess({ payment, providerPaymentId, method: providerPayment.method, req });
  return { payment: confirmed, alreadyProcessed: false };
}

// Compares what the provider says was captured with the order this
// backend created. Returns a human-readable reason, or null when it matches.
function describeCaptureMismatch(payment, { orderId, amountPaise, currency }) {
  if (orderId && orderId !== payment.providerOrderId) return `Captured against order ${orderId}, expected ${payment.providerOrderId}`;
  if (amountPaise != null && Number(amountPaise) !== Number(payment.amountPaise)) return `Captured ${amountPaise} paise, expected ${payment.amountPaise}`;
  if (currency && String(currency).toUpperCase() !== String(payment.currency || 'INR').toUpperCase()) return `Captured in ${currency}, expected ${payment.currency}`;
  return null;
}

async function flagForReconciliation(paymentId, reason, req) {
  const flagged = await paymentModel.findByIdAndUpdate(
    paymentId,
    { $set: { reconciliationRequired: true, reconciliationReason: reason }, $push: { history: { action: 'RECONCILIATION_REQUIRED', note: reason } } },
    { new: true }
  );
  await createAuditLog({ req, userId: flagged?.buyer, action: auditLogConstants.PAYMENT_RECONCILIATION_REQUIRED, entity: 'payments', entityId: paymentId, metadata: { reason } });
  // A buyer was charged for something the marketplace couldn't apply —
  // someone has to refund or reconcile it.
  await notifyAdmins('PAYMENT_RECONCILIATION_REQUIRED', {
    title: 'Payment needs refund / reconciliation',
    message: `₹${((flagged?.amountPaise || 0) / 100).toLocaleString('en-IN')} captured but not applied: ${reason}`,
    entityType: 'payment', entityId: paymentId, userId: flagged?.buyer,
    metadata: { providerOrderId: flagged?.providerOrderId, providerPaymentId: flagged?.providerPaymentId },
  });
  return flagged;
}

// Single idempotent transition to SUCCESS — safe to call twice (webhook +
// callback both racing): the conditional update means exactly one caller
// flips the payment, and only that caller advances the transaction or
// sends notifications.
async function confirmPaymentSuccess({ payment, providerPaymentId, method, req }) {
  const fresh = await paymentModel.findOneAndUpdate(
    {
      _id: payment._id,
      // FAILED is included: a buyer can retry inside the same provider
      // order after a failed attempt, and that later capture is real money.
      status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING, PAYMENT_STATES.FAILED] },
    },
    {
      $set: { providerPaymentId, status: PAYMENT_STATES.SUCCESS, failureReason: '', ...(method ? { method } : {}) },
      $push: { history: { action: 'PAYMENT_SUCCESS' } },
    },
    { new: true }
  );
  if (!fresh) {
    const current = await paymentModel.findById(payment._id);
    // A capture on an order we cancelled (its total changed at checkout):
    // real money that must not be dropped silently.
    if (current?.status === PAYMENT_STATES.CANCELLED) {
      return flagForReconciliation(current._id, 'Captured on a payment order cancelled after the order total changed — refund or reconcile', req);
    }
    return current; // the other path already handled it
  }

  // Never mark an order paid with a different amount than it now costs
  // (e.g. delivery added after this payment order was opened).
  const orderTxn = await transactionModel.findById(fresh.transaction).select('agreedAmount totalPayable fulfilment.method delivery.status').lean();
  if (orderTxn && toPaise(payableAmount(orderTxn)) !== Number(fresh.amountPaise)) {
    return flagForReconciliation(fresh._id, `Captured ${fresh.amountPaise} paise but the order total is ${toPaise(payableAmount(orderTxn))} — refund or reconcile`, req);
  }
  // Same rule as loadPayableTransaction, re-checked at capture: a delivery
  // order whose quote isn't accepted must never be marked paid.
  if (orderTxn && !deliveryQuoteService.readyForPayment(orderTxn)) {
    return flagForReconciliation(fresh._id, `Captured while the delivery quote was ${orderTxn.delivery?.status} (not accepted) — refund or reconcile`, req);
  }

  const { txn, advanced } = await transactionService.markPaymentConfirmed({ transactionId: fresh.transaction, providerPaymentId, req });
  if (!advanced) {
    // Captured money that can't be applied: the reservation expired or was
    // cancelled first, or another payment already paid this transaction.
    // The buyer HAS been charged — flag for refund/reconciliation instead
    // of telling the seller to hand over goods for a dead transaction.
    return flagForReconciliation(fresh._id, `Captured while transaction was ${txn?.status || 'missing'} — refund or reconcile`, req);
  }
  const paidAmount = `₹${(fresh.amountPaise / 100).toLocaleString('en-IN')}`;
  await notificationService.createNotification({
    recipientId: fresh.buyer, type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
    title: 'Payment successful — held securely', message: `Your payment of ${paidAmount} is held by BUILD MATERIAL and is only released to the seller after you confirm receipt`,
    entityType: 'transaction', entityId: fresh.transaction,
  });
  // Actor is the buyer here — they're the one who just paid; the seller is
  // the receiver being told about it.
  await notificationService.createNotification({
    recipientId: fresh.seller, actorId: fresh.buyer, type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
    title: 'Payment received and held', message: (actorName) => `${actorName || 'The buyer'} paid ${paidAmount}. It is held until you deliver and the buyer confirms receipt — please proceed with handover`,
    entityType: 'transaction', entityId: fresh.transaction,
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
  if (!validSignature) {
    // Either a misconfigured PAYMENT_WEBHOOK_SECRET (real payments stop
    // confirming) or someone probing the endpoint — both need a human.
    // One alert per hour, not one per request.
    await notifyAdmins('WEBHOOK_SIGNATURE_INVALID', {
      title: 'Payment webhook rejected — invalid signature',
      message: configenv.PAYMENT_WEBHOOK_SECRET
        ? 'A webhook call failed signature verification. Check PAYMENT_WEBHOOK_SECRET matches the Razorpay dashboard, or investigate spoofing attempts.'
        : 'PAYMENT_WEBHOOK_SECRET is not set, so every payment webhook is rejected and payments may not confirm. Configure it now.',
      dedupeKey: `WEBHOOK_SIGNATURE_INVALID:${new Date().toISOString().slice(0, 13)}`,
      metadata: { eventType: payload?.event || null },
    });
    throw new PaymentError('Invalid webhook signature', 401);
  }

  const eventId = payload.id || payload.event_id;
  const eventType = payload.event;
  try {
    await paymentWebhookEventModel.create({ provider: configenv.PAYMENT_PROVIDER || 'manual', eventId, eventType, payload: redact(payload) });
  } catch (err) {
    if (err.code === 11000) return { duplicate: true }; // already processed — ack without reprocessing
    throw err;
  }

  // RazorpayX payout events → payout.service (release confirmed / failed).
  if (String(eventType || '').startsWith('payout.')) {
    const payoutEntity = payload.payload?.payout?.entity;
    if (!payoutEntity) return { ignored: true };
    await require('./payout.service').handlePayoutWebhook({ eventType, entity: payoutEntity });
    return { processed: true, eventType };
  }

  const entity = payload.payload?.refund?.entity || payload.payload?.payment?.entity;
  if (!entity) return { ignored: true };

  if (eventType === 'payment.captured') {
    const payment = await paymentModel.findOne({ providerOrderId: entity.order_id });
    if (payment) {
      const mismatch = describeCaptureMismatch(payment, { orderId: entity.order_id, amountPaise: entity.amount, currency: entity.currency });
      if (mismatch) await flagForReconciliation(payment._id, mismatch);
      else await confirmPaymentSuccess({ payment, providerPaymentId: entity.id, method: entity.method });
    }
  } else if (eventType === 'payment.failed') {
    await paymentModel.updateOne(
      { providerOrderId: entity.order_id, status: { $ne: PAYMENT_STATES.SUCCESS } },
      { $set: { status: PAYMENT_STATES.FAILED, failureReason: entity.error_description || 'Payment failed at provider' }, $push: { history: { action: 'PAYMENT_FAILED_WEBHOOK' } } }
    );
    const failedFor = await paymentModel.findOne({ providerOrderId: entity.order_id }).select('transaction status').lean();
    if (failedFor && failedFor.status === PAYMENT_STATES.FAILED) {
      await escrowSafe({ transactionId: failedFor.transaction, action: 'PAYMENT_FAILED', actor: { type: ESCROW_ACTORS.PROVIDER }, reason: entity.error_description || 'Payment failed at provider', providerRef: entity.id || '' });
    }

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
    await handleRefundProcessed(entity);
  } else if (eventType === 'refund.failed') {
    const payment = await paymentModel.findOne({ providerPaymentId: entity.payment_id }).select('transaction').lean();
    if (payment) {
      await require('./refund.service').failRefund({
        transactionId: payment.transaction, providerRefundId: entity.id,
        reason: entity.error_description || entity.status_details?.description || 'Refund failed at the payment provider',
      });
    }
  }
  return { processed: true, eventType };
}

// refund.processed — normally the completion of a refund we requested
// (escrow REFUND_PENDING). A refund made directly in the provider dashboard
// is still recorded through the state machine when the escrow allows it;
// otherwise (seller already paid, partial refund) it is flagged for admin.
async function handleRefundProcessed(entity) {
  const refundService = require('./refund.service');
  const payment = await paymentModel.findOne({ providerPaymentId: entity.payment_id });
  if (!payment) return;
  const fullyRefunded = Number(entity.amount) >= Number(payment.amountPaise);
  const txn = await escrow.loadWithEscrow(payment.transaction);
  if (!txn) return;

  if (!fullyRefunded) {
    await paymentModel.updateOne({ _id: payment._id, status: PAYMENT_STATES.SUCCESS }, { $set: { status: PAYMENT_STATES.PARTIALLY_REFUNDED }, $push: { refunds: { providerRefundId: entity.id, amountPaise: entity.amount, status: 'processed' }, history: { action: 'PARTIAL_REFUND_PROCESSED' } } });
    await transactionModel.updateOne({ _id: txn._id }, { $set: { escrowAttentionReason: `Partial refund of ₹${(entity.amount / 100).toLocaleString('en-IN')} made at the provider — reconcile` } });
    await notifyAdmins('PAYMENT_RECONCILIATION_REQUIRED', {
      title: 'Partial refund made at the provider',
      message: `₹${(entity.amount / 100).toLocaleString('en-IN')} of ₹${(payment.amountPaise / 100).toLocaleString('en-IN')} was refunded outside the escrow flow (${entity.id}). Reconcile the seller settlement.`,
      entityType: 'transaction', entityId: txn._id, userId: payment.buyer,
    });
    return;
  }

  if (txn.escrowStatus === ESCROW_STATES.REFUND_PENDING) {
    await refundService.completeRefund({ transactionId: txn._id, providerRefundId: entity.id, amountPaise: entity.amount });
    return;
  }
  if (txn.escrowStatus === ESCROW_STATES.REFUNDED) return; // duplicate delivery
  if (ESCROW_TRANSITIONS.REQUEST_REFUND.from.includes(txn.escrowStatus)) {
    // Refunded from the provider dashboard: record it the same way.
    await escrowSafe({ transactionId: txn._id, action: 'REQUEST_REFUND', actor: { type: ESCROW_ACTORS.PROVIDER }, reason: 'Refund initiated at the payment provider', providerRef: entity.id, amount: payableAmount(txn), set: { 'refund.status': 'PENDING', 'refund.amount': payableAmount(txn), 'refund.requestedAt': new Date() } });
    await refundService.completeRefund({ transactionId: txn._id, providerRefundId: entity.id, amountPaise: entity.amount });
    return;
  }
  // e.g. RELEASED: the seller has already been paid — money must be recovered offline.
  await paymentModel.updateOne({ _id: payment._id }, { $set: { status: PAYMENT_STATES.REFUNDED, reconciliationRequired: true, reconciliationReason: `Refunded at provider while escrow was ${txn.escrowStatus}` }, $push: { refunds: { providerRefundId: entity.id, amountPaise: entity.amount, status: 'processed' } } });
  await transactionModel.updateOne({ _id: txn._id }, { $set: { escrowAttentionReason: `Buyer refunded at the provider (${entity.id}) while payment was ${txn.escrowStatus} — recover from seller / reconcile` } });
  await notifyAdmins('PAYMENT_RECONCILIATION_REQUIRED', {
    title: 'Refund processed after the seller was paid',
    message: `₹${(entity.amount / 100).toLocaleString('en-IN')} was refunded to the buyer (${entity.id}) but the escrow was already ${txn.escrowStatus}. Recover or reconcile the seller payout.`,
    entityType: 'transaction', entityId: txn._id, userId: payment.buyer,
  });
}

// Admin-triggered refund — calls the real provider refund API (never a
// bare DB-field flip, per spec "DO NOT FAKE REFUNDS"). The payment/
// transaction only actually flip to REFUNDED once the provider confirms
// via the refund.processed webhook above; this just authorizes and starts
// that process and records who did it.
async function initiateAdminRefund({ paymentId, adminId, reason, idempotencyKey = null, req }) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new PaymentError('Invalid payment id', 404);
  const payment = await paymentModel.findOne({ _id: paymentId, is_deleted: deleteConstants.NOT_DELETED });
  if (!payment) throw new PaymentError('Payment not found', 404);
  if (![PAYMENT_STATES.SUCCESS, PAYMENT_STATES.PARTIALLY_REFUNDED].includes(payment.status)) {
    throw new PaymentError(`Cannot refund a payment in status ${payment.status}`, 409);
  }

  const txn = await escrow.loadWithEscrow(payment.transaction);
  const isOrphanCapture = payment.reconciliationRequired && txn && !ESCROW_TRANSITIONS.REQUEST_REFUND.from.includes(txn.escrowStatus);
  if (!isOrphanCapture) {
    // Normal case: the escrow refund flow (state machine, idempotent claim,
    // completes only when the provider confirms).
    const refundService = require('./refund.service');
    await refundService.requestRefund({ transactionId: payment.transaction, actor: { type: ESCROW_ACTORS.ADMIN, id: adminId }, reason, idempotencyKey, req });
    return paymentModel.findById(payment._id);
  }

  // Orphan capture (money taken for an order that was already cancelled /
  // paid by another attempt): refund this payment only. Atomic claim on the
  // payment so a double-click cannot refund it twice.
  if (payment.provider === 'manual') throw new PaymentError('Manual test payments have no real provider transaction to refund', 409);
  const claimed = await paymentModel.findOneAndUpdate(
    { _id: payment._id, status: { $in: [PAYMENT_STATES.SUCCESS, PAYMENT_STATES.PARTIALLY_REFUNDED] }, 'refunds.status': { $nin: ['initiated', 'pending', 'created'] } },
    { $push: { refunds: { providerRefundId: '', amountPaise: payment.amountPaise, status: 'initiated', initiatedByAdminId: adminId }, history: { action: 'ORPHAN_REFUND_REQUESTED_BY_ADMIN', note: reason || '' } } },
    { new: true }
  );
  if (!claimed) throw new PaymentError('A refund for this payment is already in progress', 409);
  try {
    const { providerRefundId, status } = await getPaymentAdapter().initiateRefund({
      providerPaymentId: payment.providerPaymentId, amountPaise: payment.amountPaise,
      receipt: `orf_${String(payment._id)}`, notes: { reason: String(reason || '').slice(0, 200) },
    });
    await paymentModel.updateOne({ _id: payment._id, 'refunds.status': 'initiated' }, { $set: { 'refunds.$.providerRefundId': providerRefundId, 'refunds.$.status': status || 'pending' } });
    await createAuditLogAdmin({ req, adminId, action: auditLogConstants.REFUND_INITIATED, entity: 'payments', entityId: payment._id, metadata: { providerRefundId, reason, orphan: true } });
  } catch (err) {
    await paymentModel.updateOne({ _id: payment._id, 'refunds.status': 'initiated' }, { $set: { 'refunds.$.status': 'failed' } });
    throw new PaymentError(`Refund failed at the payment provider: ${err.message}`, 502);
  }
  return paymentModel.findById(payment._id);
}

module.exports = { PaymentError, createPaymentOrder, createManualTestPayment, verifyPayment, handleWebhook, initiateAdminRefund };