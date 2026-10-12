/**
 * Seller handover → buyer confirmation → settlement (transaction.service):
 *  - handover moves the order to HANDOVER_STARTED and is what makes
 *    "Confirm Material Received" available to the buyer (partyActions),
 *  - the buyer can't confirm before handover, without the checklist, or on
 *    a disputed order; the wrong party / a stranger is refused,
 *  - a duplicate handover / confirmation never re-notifies or re-settles,
 *  - a settlement error after confirmation doesn't fail the confirmation,
 *  - settlement notifications report the real payout status, once.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../model/transaction.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), findById: jest.fn(), find: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../model/payment.model', () => ({ exists: jest.fn() }));
jest.mock('../model/payout.model', () => ({ findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })), exists: jest.fn() }));
jest.mock('../model/user.model', () => ({ findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ sellerType: 'INDIVIDUAL' }) }) })) }));
jest.mock('../service/app/payout.service', () => ({ evaluateAndInitiatePayout: jest.fn() }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined), createAuditLogAdmin: jest.fn() }));
jest.mock('../service/app/commission.service', () => ({
  getApplicableCommission: jest.fn().mockResolvedValue({ sellerType: 'INDIVIDUAL', pct: 8.9, settingId: 'setting-1' }),
}));
jest.mock('../service/app/escrow.service', () => {
  class EscrowTransitionError extends Error { constructor(m, o = {}) { super(m); this.statusCode = o.statusCode || 409; } }
  return { EscrowTransitionError, transition: jest.fn(), loadWithEscrow: jest.fn(), deriveLegacyEscrowStatus: jest.fn() };
});

const transactionModel = require('../model/transaction.model');
const escrow = require('../service/app/escrow.service');
const payoutService = require('../service/app/payout.service');
const notificationService = require('../service/app/notification.service');
const { notifyAdmins } = require('../service/admin/adminNotification.service');
const transactionService = require('../service/app/transaction.service');

const TXN = '64b0000000000000000000a1';
const BUYER = '64b0000000000000000000b1';
const SELLER = '64b0000000000000000000c1';
const STRANGER = '64b0000000000000000000d1';
const PAID_AT = new Date(Date.now() - 2 * 60 * 60 * 1000);
const CHECKLIST = { materialMatches: true, quantityMatches: true, noVisibleDamage: true, documentsChecked: true };

// A mongoose-ish document: findById() results are populated in place.
const doc = (fields) => {
  const d = { handoverEvidence: [], ...fields };
  d.populate = jest.fn(async () => { d.listing = { title: 'TMT Steel 12mm', unit: 'tonne' }; return d; });
  return d;
};
const order = (over = {}) => ({
  _id: TXN, buyer: BUYER, seller: SELLER, listing: 'listing-1', agreedQuantity: 10, agreedAmount: 10000,
  status: 'PAYMENT_CONFIRMED', escrowStatus: 'HELD', disputed: false, paymentConfirmedAt: PAID_AT,
  platformCommissionPct: 8.9, platformCommissionAmount: 890, sellerSettlementAmount: 9110, ...over,
});
const details = (over = {}) => ({ handedOverAt: new Date(Date.now() - 60 * 1000).toISOString(), quantity: 10, packageCount: 4, challanNumber: 'DC-101', ...over });

let state;
beforeEach(() => {
  jest.clearAllMocks();
  state = order();
  transactionModel.findOne.mockImplementation(async () => doc(state));
  transactionModel.findById.mockImplementation(async () => doc(state));
  // A transition applies only from its allowed state, like the real CAS.
  escrow.transition.mockImplementation(async ({ action, set = {} }) => {
    const from = { MARK_DELIVERED: 'HELD', BUYER_CONFIRM: 'DELIVERED', RAISE_DISPUTE: 'DELIVERED' }[action];
    if (from && state.escrowStatus !== from) return { applied: false, duplicate: true, txn: state };
    const to = { MARK_DELIVERED: 'DELIVERED', BUYER_CONFIRM: 'BUYER_CONFIRMED', RAISE_DISPUTE: 'DISPUTED' }[action];
    state = { ...state, ...set, ...(to ? { escrowStatus: to } : {}) };
    return { applied: true, txn: state };
  });
  escrow.loadWithEscrow.mockImplementation(async () => state);
  payoutService.evaluateAndInitiatePayout.mockResolvedValue({ _id: 'payout-1', status: 'PROCESSING', netPayoutAmount: 9110 });
});

describe('seller handover', () => {
  test('records the handover details and makes "Confirm Material Received" available to the buyer', async () => {
    expect(transactionService.partyActions(state, 'buyer').canConfirmReceipt).toBe(false);
    expect(transactionService.partyActions(state, 'seller').canHandover).toBe(true);

    const { txn, alreadyRecorded } = await transactionService.markHandover({ transactionId: TXN, userId: SELLER, details: details(), note: 'Unloaded at site gate' });

    expect(alreadyRecorded).toBe(false);
    expect(txn.status).toBe('HANDOVER_STARTED');
    const call = escrow.transition.mock.calls[0][0];
    expect(call).toMatchObject({ action: 'MARK_DELIVERED', actor: { type: 'seller', id: SELLER } });
    expect(call.set.handoverDetails).toMatchObject({ quantity: 10, packageCount: 4, challanNumber: 'DC-101', declaredBy: SELLER });
    expect(transactionService.partyActions(state, 'buyer')).toMatchObject({ canConfirmReceipt: true, canReportIssue: true });
    expect(transactionService.partyActions(state, 'seller').canHandover).toBe(false);

    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    const n = notificationService.createNotification.mock.calls[0][0];
    expect(n).toMatchObject({ recipientId: BUYER, type: 'HANDOVER_STARTED', entityType: 'transaction', entityId: TXN, dedupeKey: `HANDOVER_STARTED:${TXN}` });
    expect(n.message).toContain('#000000A1');
    expect(n.message).toMatch(/confirm receipt or report an issue/);
  });

  test('a second handover click is a no-op: no new transition, no second notification', async () => {
    state = order({ status: 'HANDOVER_STARTED', escrowStatus: 'DELIVERED' });
    const { alreadyRecorded } = await transactionService.markHandover({ transactionId: TXN, userId: SELLER, details: details() });
    expect(alreadyRecorded).toBe(true);
    expect(escrow.transition).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test.each([
    ['in the future', details({ handedOverAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }), /future/],
    ['before payment', details({ handedOverAt: new Date(PAID_AT.getTime() - 60 * 60 * 1000).toISOString() }), /before the payment/],
    ['more than ordered', details({ quantity: 11 }), /cannot exceed/],
  ])('rejects a handover time/quantity %s', async (_, d, msg) => {
    await expect(transactionService.markHandover({ transactionId: TXN, userId: SELLER, details: d })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(msg) });
    expect(escrow.transition).not.toHaveBeenCalled();
  });

  test('unpaid or disputed orders cannot be handed over', async () => {
    state = order({ status: 'PAYMENT_PENDING', escrowStatus: 'INITIATED' });
    await expect(transactionService.markHandover({ transactionId: TXN, userId: SELLER, details: details() })).rejects.toMatchObject({ statusCode: 409 });
    state = order({ status: 'DISPUTED', disputed: true, escrowStatus: 'DISPUTED' });
    await expect(transactionService.markHandover({ transactionId: TXN, userId: SELLER, details: details() })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('only the seller may hand over; strangers cannot learn the order exists', async () => {
    await expect(transactionService.markHandover({ transactionId: TXN, userId: BUYER, details: details() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(transactionService.markHandover({ transactionId: TXN, userId: STRANGER, details: details() })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('buyer confirmation', () => {
  const handedOver = () => { state = order({ status: 'HANDOVER_STARTED', escrowStatus: 'DELIVERED', handoverStartedAt: new Date() }); };

  test('cannot confirm before the seller records handover', async () => {
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/not marked this order as handed over/) });
    expect(escrow.transition).not.toHaveBeenCalled();
    expect(payoutService.evaluateAndInitiatePayout).not.toHaveBeenCalled();
  });

  test('requires the acknowledgement and every checklist item', async () => {
    handedOver();
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: false, checklist: CHECKLIST })).rejects.toMatchObject({ statusCode: 400 });
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: { ...CHECKLIST, noVisibleDamage: false } })).rejects.toMatchObject({ statusCode: 400 });
    expect(escrow.transition).not.toHaveBeenCalled();
  });

  test('only the buyer may confirm', async () => {
    handedOver();
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: SELLER, acknowledged: true, checklist: CHECKLIST })).rejects.toMatchObject({ statusCode: 403 });
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: STRANGER, acknowledged: true, checklist: CHECKLIST })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('a disputed order cannot be confirmed (no automatic payout)', async () => {
    state = order({ status: 'DISPUTED', escrowStatus: 'DISPUTED', disputed: true });
    await expect(transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST })).rejects.toMatchObject({ statusCode: 409 });
    expect(payoutService.evaluateAndInitiatePayout).not.toHaveBeenCalled();
    expect(transactionService.partyActions(state, 'buyer').canConfirmReceipt).toBe(false);
  });

  test('confirmation records the checklist, notifies the seller once and starts settlement', async () => {
    handedOver();
    const { alreadyConfirmed } = await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });

    expect(alreadyConfirmed).toBe(false);
    const confirm = escrow.transition.mock.calls.find((c) => c[0].action === 'BUYER_CONFIRM')[0];
    expect(confirm.where).toMatchObject({ status: 'HANDOVER_STARTED', disputed: { $ne: true } });
    expect(confirm.set.receiptConfirmation).toMatchObject({ checklist: CHECKLIST, confirmedBy: BUYER });
    expect(payoutService.evaluateAndInitiatePayout).toHaveBeenCalledTimes(1);

    const sent = notificationService.createNotification.mock.calls.map((c) => c[0]);
    expect(sent.find((n) => n.type === 'RECEIPT_CONFIRMED')).toMatchObject({ recipientId: SELLER, dedupeKey: `RECEIPT_CONFIRMED:${TXN}` });
    // Payout is PROCESSING → both parties are told exactly that (not "paid").
    const buyerUpdate = sent.find((n) => n.type === 'SETTLEMENT_UPDATE' && n.recipientId === BUYER);
    const sellerUpdate = sent.find((n) => n.type === 'SETTLEMENT_UPDATE' && n.recipientId === SELLER);
    expect(buyerUpdate.message).toBe('Your order #000000A1 has been confirmed. Seller payment settlement is processing.');
    expect(sellerUpdate.message).toBe('Settlement for order #000000A1 is processing. Amount: ₹9,110.');
  });

  test('repeated confirmation clicks never start a second settlement', async () => {
    handedOver();
    await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    const second = await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    expect(second.alreadyConfirmed).toBe(true);
    expect(payoutService.evaluateAndInitiatePayout).toHaveBeenCalledTimes(1);
    expect(notificationService.createNotification.mock.calls.filter((c) => c[0].type === 'RECEIPT_CONFIRMED')).toHaveLength(1);
  });

  test('a concurrent request that lost the race does not settle', async () => {
    handedOver();
    escrow.transition.mockResolvedValueOnce({ applied: false, duplicate: true, txn: state });
    const res = await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    expect(res.alreadyConfirmed).toBe(true);
    expect(payoutService.evaluateAndInitiatePayout).not.toHaveBeenCalled();
  });

  test('a settlement error does not fail the confirmation; admins are alerted and status stays "pending"', async () => {
    handedOver();
    payoutService.evaluateAndInitiatePayout.mockRejectedValue(new Error('Mongo timeout'));
    const res = await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    expect(res.alreadyConfirmed).toBe(false);
    expect(notifyAdmins).toHaveBeenCalledWith('ESCROW_ACTION_REQUIRED', expect.objectContaining({ dedupeKey: `SETTLEMENT_START_FAILED:${TXN}` }));
    const buyerUpdate = notificationService.createNotification.mock.calls.map((c) => c[0]).find((n) => n.type === 'SETTLEMENT_UPDATE' && n.recipientId === BUYER);
    expect(buyerUpdate.message).toMatch(/settlement is pending\.$/);
  });

  test('payout waiting on the seller\'s bank account is reported as on hold, never as paid', async () => {
    handedOver();
    payoutService.evaluateAndInitiatePayout.mockResolvedValue({ _id: 'payout-1', status: 'PAYOUT_ELIGIBLE', netPayoutAmount: 9110 });
    await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    const seller = notificationService.createNotification.mock.calls.map((c) => c[0]).find((n) => n.type === 'SETTLEMENT_UPDATE' && n.recipientId === SELLER);
    expect(seller.message).toMatch(/on hold until your payout bank account is verified/);
    expect(seller).toMatchObject({ entityType: 'payout', entityId: 'payout-1' });
  });

  test('PAID / failed payouts are announced by payout.service only (no duplicate settlement message)', async () => {
    handedOver();
    payoutService.evaluateAndInitiatePayout.mockResolvedValue({ _id: 'payout-1', status: 'PAID', netPayoutAmount: 9110 });
    await transactionService.confirmReceipt({ transactionId: TXN, userId: BUYER, acknowledged: true, checklist: CHECKLIST });
    expect(notificationService.createNotification.mock.calls.filter((c) => c[0].type === 'SETTLEMENT_UPDATE')).toHaveLength(0);
  });
});

describe('report an issue (dispute)', () => {
  test('buyer can report an issue after handover; payment stays held and the seller is told once', async () => {
    state = order({ status: 'HANDOVER_STARTED', escrowStatus: 'DELIVERED' });
    await transactionService.raiseDispute({ transactionId: TXN, userId: BUYER, reason: 'Damaged Material — 3 bundles bent' });
    expect(escrow.transition.mock.calls[0][0]).toMatchObject({ action: 'RAISE_DISPUTE', set: expect.objectContaining({ disputed: true, settlementStatus: 'ON_HOLD' }) });
    expect(notifyAdmins).toHaveBeenCalledWith('TRANSACTION_DISPUTED', expect.any(Object));
    const n = notificationService.createNotification.mock.calls[0][0];
    expect(n).toMatchObject({ recipientId: SELLER, type: 'TRANSACTION_DISPUTED', dedupeKey: `TRANSACTION_DISPUTED:${TXN}` });
    expect(payoutService.evaluateAndInitiatePayout).not.toHaveBeenCalled();
  });

  test('a dispute racing a completed confirmation is refused with a clear 409', async () => {
    state = order({ status: 'HANDOVER_STARTED', escrowStatus: 'DELIVERED' });
    escrow.transition.mockRejectedValueOnce(new escrow.EscrowTransitionError('This payment is already released', { statusCode: 409 }));
    await expect(transactionService.raiseDispute({ transactionId: TXN, userId: BUYER, reason: 'x' })).rejects.toMatchObject({ name: 'TransactionError', statusCode: 409 });
  });
});

describe('commission', () => {
  test('8.9% of a ₹10,000 subtotal → ₹890 commission, ₹9,110 to the seller (rate from the configured setting)', async () => {
    const c = await transactionService.calculateCommission(10000, 'INDIVIDUAL');
    expect(c).toMatchObject({ pct: 8.9, commission: 890, settlement: 9110, settingId: 'setting-1' });
  });
});
