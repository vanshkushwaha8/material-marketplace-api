/**
 * Seller-quoted delivery: the vehicle recommendation, the quote state
 * machine (version compare-and-set, reason on vehicle change, lock after
 * acceptance) and the rule that money moves only on the buyer's accept.
 */

jest.mock('../model/transaction.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ title: 'TMT Rod 16mm' }) }) })) }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(null) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined), createAuditLogAdmin: jest.fn() }));
jest.mock('../service/app/vehicleType.service', () => {
  const vehicles = {
    PICKUP: { code: 'PICKUP', name: 'Pickup', maxPayloadKg: 1500 },
    TEN_WHEELER: { code: 'TEN_WHEELER', name: '10-wheeler truck', maxPayloadKg: 18000 },
  };
  return {
    findActiveByCode: jest.fn(async (c) => vehicles[c] || null),
    snapshot: (v) => (v ? { code: v.code, name: v.name, maxPayloadKg: v.maxPayloadKg ?? null } : null),
    listActive: jest.fn(),
  };
});

const transactionModel = require('../model/transaction.model');
const notificationService = require('../service/app/notification.service');
const { computeRequirement, recommendVehicle } = require('../service/app/deliveryRequirement.service');
const dq = require('../service/app/deliveryQuote.service');

const BUYER = '64b000000000000000000001';
const SELLER = '64b000000000000000000002';
const TXN = '64b0000000000000000000aa';

const baseTxn = (delivery = {}, extra = {}) => ({
  _id: TXN, buyer: BUYER, seller: SELLER, listing: 'l1', status: 'PAYMENT_PENDING', createdAt: new Date(),
  agreedAmount: 85000, buyerFeeAmount: 1700, deliveryCharge: 0, totalPayable: 86700,
  fulfilment: { method: 'DELIVERY' },
  delivery: { status: 'AWAITING_SELLER', version: 0, buyerRequestedVehicle: { code: 'PICKUP', name: 'Pickup', maxPayloadKg: 1500 }, ...delivery },
  ...extra,
});

// findOneAndUpdate returns the row with the $set applied (dotted paths).
function applyUpdate(row, update) {
  const out = JSON.parse(JSON.stringify(row));
  for (const [path, value] of Object.entries(update.$set || {})) {
    const keys = path.split('.');
    let o = out;
    keys.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }
  return out;
}

describe('computeRequirement / recommendVehicle', () => {
  const vehicles = [
    { code: 'TATA_ACE', maxPayloadKg: 750, autoRecommend: true },
    { code: 'PICKUP', maxPayloadKg: 1500, autoRecommend: true },
    { code: 'TEN_WHEELER', maxPayloadKg: 18000, autoRecommend: true },
    { code: 'TIPPER', maxPayloadKg: 16000, autoRecommend: false },
    { code: 'OTHER', maxPayloadKg: null, autoRecommend: false },
  ];

  test('sums weight over lines, deriving kg/ton units without weightPerUnitKg', () => {
    const r = computeRequirement([
      { quantity: 200, unit: 'rod', weightPerUnitKg: 18.96 }, // 16mm × 12m
      { quantity: 50, unit: 'bag', weightPerUnitKg: 50 },
      { quantity: 2, unit: 'ton' },
    ]);
    expect(r).toEqual({ totalWeightKg: 3792 + 2500 + 2000, weightKnown: true, unknownLines: 0 });
  });

  test('any unknown line makes the total unknown (a partial total would under-size the vehicle)', () => {
    const r = computeRequirement([{ quantity: 10, unit: 'bag', weightPerUnitKg: 50 }, { quantity: 5000, unit: 'piece' }]);
    expect(r.totalWeightKg).toBeNull();
    expect(r.weightKnown).toBe(false);
    expect(recommendVehicle(r.totalWeightKg, vehicles).vehicle).toBeNull();
  });

  test('smallest auto-recommendable vehicle that carries the load; special vehicles never auto-picked', () => {
    expect(recommendVehicle(1200, vehicles).vehicle.code).toBe('PICKUP');
    expect(recommendVehicle(8292, vehicles).vehicle.code).toBe('TEN_WHEELER');
  });

  test('heavier than every vehicle → largest, flagged for multiple trips', () => {
    expect(recommendVehicle(40000, vehicles)).toEqual({ vehicle: expect.objectContaining({ code: 'TEN_WHEELER' }), multipleTrips: true });
  });
});

describe('readyForPayment', () => {
  test('pickup is payable; delivery only once a quote is accepted', () => {
    expect(dq.readyForPayment({ fulfilment: { method: 'PICKUP' } })).toBe(true);
    expect(dq.readyForPayment(baseTxn({ status: 'AWAITING_SELLER' }))).toBe(false);
    expect(dq.readyForPayment(baseTxn({ status: 'QUOTED' }))).toBe(false);
    expect(dq.readyForPayment(baseTxn({ status: 'ACCEPTED' }))).toBe(true);
  });

  test('legacy delivery orders priced by the rate card (no quote) stay payable', () => {
    expect(dq.readyForPayment({ fulfilment: { method: 'DELIVERY' } })).toBe(true);
  });
});

describe('seller quote', () => {
  beforeEach(() => jest.clearAllMocks());

  test('changing the buyer\'s vehicle without a reason is refused before any write', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn()) });
    await expect(dq.quote({ transactionId: TXN, sellerId: SELLER, vehicleCode: 'TEN_WHEELER', charge: 3500 }))
      .rejects.toMatchObject({ code: 'VEHICLE_CHANGE_REASON_REQUIRED' });
    expect(transactionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('quote stores a proposal only — deliveryCharge/totalPayable are untouched, version bumps', async () => {
    const current = baseTxn();
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(current) });
    transactionModel.findOneAndUpdate.mockImplementation((where, update) => ({ lean: () => Promise.resolve(applyUpdate(current, update)) }));

    const txn = await dq.quote({ transactionId: TXN, sellerId: SELLER, vehicleCode: 'TEN_WHEELER', charge: 3500, vehicleChangeReason: 'Combined weight is over 8 tonnes' });

    const [where, update] = transactionModel.findOneAndUpdate.mock.calls[0];
    expect(where).toMatchObject({ status: 'PAYMENT_PENDING', 'delivery.status': 'AWAITING_SELLER', 'delivery.version': { $in: [0, null] } });
    expect(update.$set).toMatchObject({ 'delivery.status': 'QUOTED', 'delivery.version': 1, 'delivery.charge': 3500, 'delivery.vehicleChangeReason': 'Combined weight is over 8 tonnes' });
    expect(update.$set).not.toHaveProperty('deliveryCharge');
    expect(update.$set).not.toHaveProperty('totalPayable');
    expect(txn.totalPayable).toBe(86700);
    expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: BUYER, type: 'DELIVERY_QUOTED' }));
  });

  test('another party cannot act on the order', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn()) });
    await expect(dq.quote({ transactionId: TXN, sellerId: BUYER, vehicleCode: 'PICKUP', charge: 100 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('buyer accept', () => {
  beforeEach(() => jest.clearAllMocks());

  test('accepting version N sets deliveryCharge and totalPayable from the stored quote, never from the client', async () => {
    const current = baseTxn({ status: 'QUOTED', version: 2, charge: 3500, sellerApprovedVehicle: { code: 'TEN_WHEELER', name: '10-wheeler truck' } });
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(current) });
    transactionModel.findOneAndUpdate.mockImplementation((where, update) => ({ lean: () => Promise.resolve(applyUpdate(current, update)) }));

    const txn = await dq.accept({ transactionId: TXN, buyerId: BUYER, version: 2 });

    const [where, update] = transactionModel.findOneAndUpdate.mock.calls[0];
    expect(where).toMatchObject({ 'delivery.status': 'QUOTED', 'delivery.version': 2 });
    expect(update.$set).toMatchObject({ deliveryCharge: 3500, totalPayable: 90200, 'delivery.status': 'ACCEPTED' });
    expect(update.$push['delivery.history']).toMatchObject({ action: 'ACCEPT', charge: 3500, vehicle: { code: 'TEN_WHEELER' } });
    expect(txn.delivery.status).toBe('ACCEPTED');
  });

  test('accepting a version the seller has since revised is refused', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn({ status: 'QUOTED', version: 3, charge: 4200 })) });
    await expect(dq.accept({ transactionId: TXN, buyerId: BUYER, version: 2 })).rejects.toMatchObject({ code: 'QUOTE_CHANGED' });
    expect(transactionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a race lost at write time (seller revised in between) is a 409, not a silent accept', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn({ status: 'QUOTED', version: 2, charge: 3500 })) });
    transactionModel.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
    await expect(dq.accept({ transactionId: TXN, buyerId: BUYER, version: 2 })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE', statusCode: 409 });
  });

  test('once accepted, the seller can no longer change the quote', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn({ status: 'ACCEPTED', version: 2, charge: 3500 })) });
    await expect(dq.quote({ transactionId: TXN, sellerId: SELLER, vehicleCode: 'PICKUP', charge: 9999 })).rejects.toMatchObject({ code: 'DELIVERY_LOCKED' });
  });

  test('nothing can change after payment', async () => {
    transactionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(baseTxn({ status: 'ACCEPTED' }, { status: 'PAYMENT_CONFIRMED' })) });
    await expect(dq.reject({ transactionId: TXN, buyerId: BUYER, version: 1 })).rejects.toMatchObject({ code: 'ORDER_NOT_PENDING' });
  });
});

describe('allowedActions', () => {
  test('each side only sees its own moves', () => {
    const quoted = baseTxn({ status: 'QUOTED', version: 1 });
    expect(dq.allowedActions(quoted, 'buyer').sort()).toEqual(['ACCEPT', 'REJECT']);
    expect(dq.allowedActions(quoted, 'seller').sort()).toEqual(['DECLINE', 'QUOTE']);
    expect(dq.allowedActions(baseTxn({ status: 'ACCEPTED' }), 'seller')).toEqual([]);
  });
});
