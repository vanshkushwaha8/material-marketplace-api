/**
 * Refund + payout services around the escrow state machine:
 *  - the provider is called only after an atomic claim (no double refund /
 *    double payout on double-click or concurrent admin retry),
 *  - success is recorded only when the provider confirms,
 *  - failures go to REFUND_FAILED / REQUIRES_ADMIN_ACTION for admin retry,
 *  - a refund is refused once the seller payout is in flight / paid.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(null) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null), createAuditLogAdmin: jest.fn().mockResolvedValue(null) }));
jest.mock('../service/app/review.service', () => ({ invalidateForTransaction: jest.fn().mockResolvedValue(null) }));
jest.mock('../model/transaction.model', () => ({ findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../model/payment.model', () => ({ findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../model/payout.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), create: jest.fn() }));
jest.mock('../model/sellerBankAccount.model', () => ({ findOne: jest.fn() }));
jest.mock('../model/user.model', () => ({ findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ status: 'approved' }) }) })) }));
jest.mock('../service/app/escrow.service', () => {
  class EscrowTransitionError extends Error {}
  return { EscrowTransitionError, transition: jest.fn(), loadWithEscrow: jest.fn() };
});
const mockRefundAdapter = { initiateRefund: jest.fn(), fetchRefund: jest.fn() };
const mockPayoutAdapter = { createPayout: jest.fn(), fetchPayout: jest.fn() };
jest.mock('../config/integrations.config', () => ({
  getPaymentAdapter: () => mockRefundAdapter,
  getManualTestPaymentAdapter: () => mockRefundAdapter,
  getPayoutAdapter: () => mockPayoutAdapter,
}));

const escrow = require('../service/app/escrow.service');
const paymentModel = require('../model/payment.model');
const payoutModel = require('../model/payout.model');
const sellerBankAccountModel = require('../model/sellerBankAccount.model');
const refundService = require('../service/app/refund.service');
const payoutService = require('../service/app/payout.service');

const TXN = '64b0000000000000000000a1';
const ADMIN = { type: 'admin', id: '64b0000000000000000000ff' };
const sortable = (v) => ({ sort: () => Promise.resolve(v) });
const leanSel = (v) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });
const payment = () => ({ _id: 'pay-1', provider: 'razorpay', providerPaymentId: 'pay_X', amountPaise: 100000, refunds: [], history: [], save: jest.fn().mockResolvedValue(null) });

beforeEach(() => {
  jest.clearAllMocks();
  escrow.loadWithEscrow.mockResolvedValue({ _id: TXN, escrowStatus: 'HELD', agreedAmount: 1000, buyer: 'b', seller: 's', refund: { attempts: 0 } });
  escrow.transition.mockImplementation(async ({ action }) => ({ applied: true, txn: { _id: TXN, buyer: 'b', seller: 's', agreedAmount: 1000, refund: { attempts: 1 } }, action }));
  payoutModel.findOne.mockReturnValue(leanSel(null));
  paymentModel.findOne.mockReturnValue(sortable(payment()));
});

describe('refunds', () => {
  test('claims REFUND_PENDING first, then calls the provider with a per-attempt receipt; sync "processed" completes it', async () => {
    mockRefundAdapter.initiateRefund.mockResolvedValue({ providerRefundId: 'rfnd_1', status: 'processed' });
    await refundService.requestRefund({ transactionId: TXN, actor: ADMIN, reason: 'Buyer never received goods' });
    const actions = escrow.transition.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(['REQUEST_REFUND', 'REFUND_CONFIRMED']);
    expect(mockRefundAdapter.initiateRefund).toHaveBeenCalledWith(expect.objectContaining({ providerPaymentId: 'pay_X', amountPaise: 100000, receipt: `rf_${TXN}_1` }));
  });

  test('pending at the provider → stays REFUND_PENDING (completed later by refund.processed)', async () => {
    mockRefundAdapter.initiateRefund.mockResolvedValue({ providerRefundId: 'rfnd_1', status: 'pending' });
    require('../model/transaction.model').findById.mockReturnValue({ lean: () => Promise.resolve({ escrowStatus: 'REFUND_PENDING' }) });
    await refundService.requestRefund({ transactionId: TXN, actor: ADMIN, reason: 'x' });
    expect(escrow.transition.mock.calls.map((c) => c[0].action)).toEqual(['REQUEST_REFUND']);
  });

  test('duplicate request (claim not applied) never calls the provider again', async () => {
    escrow.transition.mockResolvedValueOnce({ applied: false, duplicate: true, txn: { _id: TXN } });
    await refundService.requestRefund({ transactionId: TXN, actor: ADMIN, reason: 'x' });
    expect(mockRefundAdapter.initiateRefund).not.toHaveBeenCalled();
  });

  test('provider error → REFUND_FAILED (admin retry), error surfaced', async () => {
    mockRefundAdapter.initiateRefund.mockRejectedValue(new Error('Insufficient balance'));
    await expect(refundService.requestRefund({ transactionId: TXN, actor: ADMIN, reason: 'x' })).rejects.toMatchObject({ statusCode: 502 });
    expect(escrow.transition.mock.calls.map((c) => c[0].action)).toEqual(['REQUEST_REFUND', 'REFUND_FAILED']);
  });

  test('refused once the seller payout is processing or paid', async () => {
    payoutModel.findOne.mockReturnValue(leanSel({ status: 'PAID' }));
    await expect(refundService.requestRefund({ transactionId: TXN, actor: ADMIN, reason: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    expect(escrow.transition).not.toHaveBeenCalled();
    expect(mockRefundAdapter.initiateRefund).not.toHaveBeenCalled();
  });
});

describe('payouts', () => {
  const bank = { _id: 'bank-1', providerFundAccountId: 'fa_1', verificationStatus: 'VERIFIED' };
  beforeEach(() => {
    escrow.loadWithEscrow.mockResolvedValue({ _id: TXN, escrowStatus: 'RELEASE_PENDING', is_deleted: '0', seller: 's', agreedAmount: 1000, platformCommissionAmount: 89 });
    sellerBankAccountModel.findOne.mockResolvedValue(bank);
    payoutModel.findOne.mockResolvedValue({ _id: 'po-1', status: 'PAYOUT_ELIGIBLE', netPayoutAmount: 911, attempts: 0 });
  });

  test('only releases when the escrow is RELEASE_PENDING (not HELD / DELIVERED)', async () => {
    escrow.loadWithEscrow.mockResolvedValue({ _id: TXN, escrowStatus: 'DELIVERED', is_deleted: '0' });
    await payoutService.evaluateAndInitiatePayout({ transactionId: TXN });
    expect(mockPayoutAdapter.createPayout).not.toHaveBeenCalled();
  });

  test('claim lost (concurrent retry already processing) → provider not called', async () => {
    payoutModel.findOneAndUpdate.mockResolvedValue(null);
    payoutModel.findById.mockResolvedValue({ _id: 'po-1', status: 'PROCESSING' });
    await payoutService.evaluateAndInitiatePayout({ transactionId: TXN });
    expect(mockPayoutAdapter.createPayout).not.toHaveBeenCalled();
  });

  test('provider processed → RELEASE_CONFIRMED; idempotency key carries the attempt number', async () => {
    payoutModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: 'po-1', transaction: TXN, seller: 's', status: 'PROCESSING', netPayoutAmount: 911, currency: 'INR', attempts: 2 })
      .mockResolvedValueOnce({ _id: 'po-1', transaction: TXN, seller: 's', status: 'PAID', netPayoutAmount: 911 });
    mockPayoutAdapter.createPayout.mockResolvedValue({ providerPayoutId: 'pout_1', status: 'processed' });
    require('../model/transaction.model').findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ buyer: 'b' }) }) });
    await payoutService.evaluateAndInitiatePayout({ transactionId: TXN });
    expect(mockPayoutAdapter.createPayout).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'po-1:2', amountPaise: 91100 }));
    expect(escrow.transition).toHaveBeenCalledWith(expect.objectContaining({ action: 'RELEASE_CONFIRMED', providerRef: 'pout_1' }));
  });

  test('provider error → payout FAILED + escrow RELEASE_FAILED (REQUIRES_ADMIN_ACTION)', async () => {
    payoutModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: 'po-1', transaction: TXN, seller: 's', status: 'PROCESSING', netPayoutAmount: 911, currency: 'INR', attempts: 1 })
      .mockResolvedValueOnce({ _id: 'po-1', transaction: TXN, seller: 's', status: 'PAYOUT_FAILED', netPayoutAmount: 911, attempts: 1 });
    mockPayoutAdapter.createPayout.mockRejectedValue(new Error('Beneficiary bank down'));
    await payoutService.evaluateAndInitiatePayout({ transactionId: TXN });
    expect(escrow.transition).toHaveBeenCalledWith(expect.objectContaining({ action: 'RELEASE_FAILED', reason: 'Beneficiary bank down' }));
  });

  test('payout.processed webhook redelivered → second time is a no-op', async () => {
    payoutModel.findOne.mockResolvedValue({ _id: 'po-1', providerPayoutId: 'pout_1' });
    payoutModel.findOneAndUpdate.mockResolvedValue(null); // already PAID
    payoutModel.findById.mockResolvedValue({ _id: 'po-1', status: 'PAID' });
    await payoutService.handlePayoutWebhook({ eventType: 'payout.processed', entity: { id: 'pout_1', status: 'processed' } });
    expect(escrow.transition).not.toHaveBeenCalled();
  });
});
