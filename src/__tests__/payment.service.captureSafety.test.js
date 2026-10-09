/**
 * Money-safety rules for payment capture (webhook + checkout callback):
 *  - exactly one path may flip a payment to SUCCESS and advance its
 *    transaction (a racing duplicate is a no-op),
 *  - a capture whose amount/currency/order doesn't match what the backend
 *    created is flagged for reconciliation and never applied,
 *  - a capture that arrives after the reservation expired is flagged for
 *    refund/reconciliation instead of telling the seller to hand over goods.
 */

jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../model/payment.model', () => ({ findOne: jest.fn(), findById: jest.fn(), findOneAndUpdate: jest.fn(), findByIdAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../model/paymentWebhookEvent.model', () => ({ create: jest.fn() }));
// The order the payment belongs to (its current total) — matches
// storedPayment's 1200000 paise unless a test changes it.
let mockOrderTxn = { agreedAmount: 12000, totalPayable: null };
jest.mock('../model/transaction.model', () => ({
  findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(mockOrderTxn) }) })),
}));
jest.mock('../model/payout.model', () => ({}));
jest.mock('../service/app/transaction.service', () => ({ markPaymentConfirmed: jest.fn() }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined), createAuditLogAdmin: jest.fn() }));
const mockAdapter = { verifyWebhookSignature: jest.fn().mockResolvedValue(true), verifyPaymentSignature: jest.fn(), fetchPayment: jest.fn() };
jest.mock('../config/integrations.config', () => ({ getPaymentAdapter: () => mockAdapter, getManualTestPaymentAdapter: jest.fn() }));

const paymentModel = require('../model/payment.model');
const paymentWebhookEventModel = require('../model/paymentWebhookEvent.model');
const transactionService = require('../service/app/transaction.service');
const notificationService = require('../service/app/notification.service');
const paymentService = require('../service/app/payment.service');

const storedPayment = { _id: 'pay-1', transaction: 'txn-1', buyer: 'buyer-1', seller: 'seller-1', providerOrderId: 'order_1', amountPaise: 1200000, currency: 'INR', status: 'CREATED' };

function capturedEvent(entityOverrides = {}) {
  return {
    id: 'evt_1',
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_rzp_1', order_id: 'order_1', amount: 1200000, currency: 'INR', method: 'upi', ...entityOverrides } } },
  };
}

describe('payment capture safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderTxn = { agreedAmount: 12000, totalPayable: null };
    paymentWebhookEventModel.create.mockResolvedValue({});
    paymentModel.findOne.mockResolvedValue(storedPayment);
    paymentModel.findByIdAndUpdate.mockResolvedValue({ ...storedPayment, reconciliationRequired: true });
  });

  test('a matching capture confirms the payment and advances the transaction once', async () => {
    paymentModel.findOneAndUpdate.mockResolvedValue({ ...storedPayment, status: 'SUCCESS' });
    transactionService.markPaymentConfirmed.mockResolvedValue({ txn: { status: 'PAYMENT_CONFIRMED' }, advanced: true });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    // Conditional flip — only from a non-terminal state.
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'pay-1', status: { $in: ['CREATED', 'PENDING', 'PROCESSING', 'FAILED'] } }),
      expect.anything(),
      expect.anything()
    );
    expect(transactionService.markPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification).toHaveBeenCalledTimes(2); // buyer + seller
    expect(paymentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('a duplicate capture (payment already SUCCESS via the other path) is a no-op', async () => {
    paymentModel.findOneAndUpdate.mockResolvedValue(null); // conditional update lost
    paymentModel.findById.mockResolvedValue({ ...storedPayment, status: 'SUCCESS' });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('a redelivered webhook event id is acknowledged without reprocessing', async () => {
    paymentWebhookEventModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const result = await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(result).toEqual({ duplicate: true });
    expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('an amount mismatch is flagged for reconciliation and never applied', async () => {
    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent({ amount: 100 }) });

    expect(paymentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ $set: expect.objectContaining({ reconciliationRequired: true }) }),
      expect.anything()
    );
    expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
  });

  test('a capture after the reservation expired is flagged, and the seller is NOT told to hand over', async () => {
    paymentModel.findOneAndUpdate.mockResolvedValue({ ...storedPayment, status: 'SUCCESS' });
    transactionService.markPaymentConfirmed.mockResolvedValue({ txn: { status: 'CANCELLED' }, advanced: false });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(paymentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ $set: expect.objectContaining({ reconciliationRequired: true, reconciliationReason: expect.stringContaining('CANCELLED') }) }),
      expect.anything()
    );
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('a capture at an outdated amount (order total changed, e.g. delivery added) is flagged, not applied', async () => {
    mockOrderTxn = { agreedAmount: 12000, totalPayable: 12390 }; // 12000 + fee + delivery
    paymentModel.findOneAndUpdate.mockResolvedValue({ ...storedPayment, status: 'SUCCESS' });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(paymentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ $set: expect.objectContaining({ reconciliationRequired: true, reconciliationReason: expect.stringContaining('order total') }) }),
      expect.anything()
    );
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('a capture on a delivery order whose seller quote is not accepted is flagged, not applied', async () => {
    // Amount matches, but delivery is still waiting for the seller.
    mockOrderTxn = { agreedAmount: 12000, totalPayable: null, fulfilment: { method: 'DELIVERY' }, delivery: { status: 'AWAITING_SELLER' } };
    paymentModel.findOneAndUpdate.mockResolvedValue({ ...storedPayment, status: 'SUCCESS' });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(paymentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ $set: expect.objectContaining({ reconciliationRequired: true, reconciliationReason: expect.stringContaining('delivery quote') }) }),
      expect.anything()
    );
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
  });

  test('a capture on a payment order cancelled at checkout is flagged for refund', async () => {
    paymentModel.findOneAndUpdate.mockResolvedValue(null); // CANCELLED is not a confirmable status
    paymentModel.findById.mockResolvedValue({ ...storedPayment, status: 'CANCELLED' });

    await paymentService.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sig', payload: capturedEvent() });

    expect(paymentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ $set: expect.objectContaining({ reconciliationRequired: true }) }),
      expect.anything()
    );
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
  });

  test('checkout callback: provider amount mismatch is rejected even with a valid signature', async () => {
    mockAdapter.verifyPaymentSignature.mockResolvedValue(true);
    mockAdapter.fetchPayment.mockResolvedValue({ status: 'captured', amountPaise: 999, currency: 'INR', orderId: 'order_1' });

    await expect(
      paymentService.verifyPayment({ buyerId: 'buyer-1', providerOrderId: 'order_1', providerPaymentId: 'pay_rzp_1', signature: 'sig', req: {} })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
  });

  test('checkout callback: an authorized-but-not-captured payment waits for the capture webhook', async () => {
    mockAdapter.verifyPaymentSignature.mockResolvedValue(true);
    mockAdapter.fetchPayment.mockResolvedValue({ status: 'authorized', amountPaise: 1200000, currency: 'INR', orderId: 'order_1' });
    paymentModel.findOneAndUpdate.mockResolvedValue({ ...storedPayment, status: 'PROCESSING' });

    const result = await paymentService.verifyPayment({ buyerId: 'buyer-1', providerOrderId: 'order_1', providerPaymentId: 'pay_rzp_1', signature: 'sig', req: {} });

    expect(result.awaitingCapture).toBe(true);
    expect(result.payment.status).toBe('PROCESSING');
    expect(transactionService.markPaymentConfirmed).not.toHaveBeenCalled();
  });
});
