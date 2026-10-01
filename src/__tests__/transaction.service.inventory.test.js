/**
 * Backend-authoritative partial inventory (spec example: 200 rods listed,
 * buyer takes 20 -> total 200 / available 180 / reserved 0 / sold 20) and
 * the "only the winner moves stock" rule for payment confirmation and
 * reservation release — now through the escrow state machine
 * (PAYMENT_CAPTURED → HOLD, CANCEL_UNPAID), with commission locked per
 * seller type from the admin commission settings.
 */

jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../model/transaction.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), findById: jest.fn(), find: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../model/payment.model', () => ({ exists: jest.fn() }));
jest.mock('../model/user.model', () => ({ findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ sellerType: 'BUSINESS_STORE' }) }) })) }));
jest.mock('../service/app/payout.service', () => ({}));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn() }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined), createAuditLogAdmin: jest.fn() }));
jest.mock('../service/app/commission.service', () => ({
  getApplicableCommission: jest.fn().mockResolvedValue({ sellerType: 'BUSINESS_STORE', pct: 8.9, settingId: 'setting-v3' }),
}));
jest.mock('../service/app/escrow.service', () => {
  class EscrowTransitionError extends Error {}
  return { EscrowTransitionError, transition: jest.fn(), loadWithEscrow: jest.fn(), deriveLegacyEscrowStatus: jest.fn() };
});

const transactionModel = require('../model/transaction.model');
const materialListingModel = require('../model/materialListing.model');
const paymentModel = require('../model/payment.model');
const escrow = require('../service/app/escrow.service');
const commissionService = require('../service/app/commission.service');
const transactionService = require('../service/app/transaction.service');

const pendingTxn = { _id: 'txn-1', listing: 'listing-1', buyer: 'buyer-1', seller: 'seller-1', agreedQuantity: 20, agreedAmount: 12000, status: 'PAYMENT_PENDING' };

describe('markPaymentConfirmed', () => {
  beforeEach(() => jest.clearAllMocks());

  test('locks the seller-type commission, moves PAID → HELD, and moves exactly the purchased quantity reserved → sold', async () => {
    transactionModel.findOne.mockResolvedValue(pendingTxn);
    escrow.transition.mockResolvedValue({ applied: true, txn: pendingTxn });
    transactionModel.findById.mockResolvedValue({ ...pendingTxn, status: 'PAYMENT_CONFIRMED' });

    const { advanced } = await transactionService.markPaymentConfirmed({ transactionId: 'txn-1', providerPaymentId: 'pay_1' });

    expect(advanced).toBe(true);
    expect(commissionService.getApplicableCommission).toHaveBeenCalledWith('BUSINESS_STORE');
    const [capture, hold] = escrow.transition.mock.calls.map((c) => c[0]);
    expect(capture).toMatchObject({ action: 'PAYMENT_CAPTURED', where: expect.objectContaining({ status: 'PAYMENT_PENDING' }), providerRef: 'pay_1' });
    // ₹12,000 gross × 8.9% → ₹1,068 commission → ₹10,932 to the seller, locked with the setting version.
    expect(capture.set).toMatchObject({
      status: 'PAYMENT_CONFIRMED', platformCommissionPct: 8.9, platformCommissionAmount: 1068, sellerSettlementAmount: 10932,
      commissionSellerType: 'BUSINESS_STORE', commissionSetting: 'setting-v3',
    });
    expect(hold).toMatchObject({ action: 'HOLD' });
    expect(materialListingModel.updateOne).toHaveBeenCalledWith(
      { _id: 'listing-1' },
      { $inc: { reservedQuantity: -20, soldQuantity: 20 } }
    );
  });

  test('a racing second confirmation does not move inventory again', async () => {
    transactionModel.findOne.mockResolvedValue(pendingTxn);
    escrow.transition.mockResolvedValue({ applied: false, txn: pendingTxn, duplicate: true }); // other path already won
    transactionModel.findById.mockResolvedValue({ ...pendingTxn, status: 'PAYMENT_CONFIRMED' });

    const { advanced } = await transactionService.markPaymentConfirmed({ transactionId: 'txn-1' });

    expect(advanced).toBe(false);
    expect(materialListingModel.updateOne).not.toHaveBeenCalled();
  });

  test('an already-cancelled (expired) transaction is reported, not revived', async () => {
    transactionModel.findOne.mockResolvedValue({ ...pendingTxn, status: 'CANCELLED' });

    const { txn, advanced } = await transactionService.markPaymentConfirmed({ transactionId: 'txn-1' });

    expect(advanced).toBe(false);
    expect(txn.status).toBe('CANCELLED');
    expect(escrow.transition).not.toHaveBeenCalled();
  });

  test('capture rejected by the state machine (e.g. escrow CANCELLED) → not advanced, no stock moved', async () => {
    transactionModel.findOne.mockResolvedValue(pendingTxn);
    escrow.transition.mockRejectedValue(new escrow.EscrowTransitionError('Cannot payment captured while the payment is cancelled'));
    transactionModel.findById.mockResolvedValue({ ...pendingTxn, status: 'CANCELLED' });

    const { advanced } = await transactionService.markPaymentConfirmed({ transactionId: 'txn-1' });

    expect(advanced).toBe(false);
    expect(materialListingModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('expireStaleReservations', () => {
  beforeEach(() => jest.clearAllMocks());

  const staleQuery = (rows) => ({ select: () => Promise.resolve(rows) });

  test('releases reserved units back to available only for the transaction it actually cancelled', async () => {
    transactionModel.find.mockReturnValue(staleQuery([{ _id: 'txn-1' }]));
    paymentModel.exists.mockResolvedValue(null);
    escrow.transition.mockResolvedValue({ applied: true, txn: { ...pendingTxn, status: 'CANCELLED' } });

    const result = await transactionService.expireStaleReservations();

    expect(result.released).toBe(1);
    expect(escrow.transition).toHaveBeenCalledWith(expect.objectContaining({ action: 'CANCEL_UNPAID', where: { status: 'PAYMENT_PENDING' } }));
    expect(materialListingModel.updateOne).toHaveBeenCalledWith(
      { _id: 'listing-1' },
      { $inc: { availableQuantity: 20, reservedQuantity: -20 } }
    );
  });

  test('skips a transaction whose buyer is mid-checkout', async () => {
    transactionModel.find.mockReturnValue(staleQuery([{ _id: 'txn-1' }]));
    paymentModel.exists.mockResolvedValue({ _id: 'pay-1' });

    const result = await transactionService.expireStaleReservations();

    expect(result.released).toBe(0);
    expect(escrow.transition).not.toHaveBeenCalled();
    expect(materialListingModel.updateOne).not.toHaveBeenCalled();
  });

  test('does not release stock when payment confirmed it between the scan and the update', async () => {
    transactionModel.find.mockReturnValue(staleQuery([{ _id: 'txn-1' }]));
    paymentModel.exists.mockResolvedValue(null);
    escrow.transition.mockRejectedValue(new escrow.EscrowTransitionError('already paid'));

    const result = await transactionService.expireStaleReservations();

    expect(result.released).toBe(0);
    expect(materialListingModel.updateOne).not.toHaveBeenCalled();
  });
});
