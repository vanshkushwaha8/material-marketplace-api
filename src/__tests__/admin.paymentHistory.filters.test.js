/**
 * Admin Payment History search + filters (service/admin/payment.service.js
 * #buildQuery): validated values only, regex-escaped search, inclusive
 * "To" date, refund / reconciliation / amount filters.
 */
jest.mock('../model/payment.model', () => ({}));
jest.mock('../model/user.model', () => ({ find: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ find: jest.fn() }));
jest.mock('../model/transaction.model', () => ({ find: jest.fn() }));

const userModel = require('../model/user.model');
const materialListingModel = require('../model/materialListing.model');
const transactionModel = require('../model/transaction.model');
const { buildQuery, PaymentHistoryError } = require('../service/admin/payment.service');

const chain = (rows) => ({ select: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }) });
const U1 = '64b0000000000000000000b1';
const L1 = '64b0000000000000000000e1';
const T1 = '64b0000000000000000000a1';

beforeEach(() => {
  jest.clearAllMocks();
  userModel.find.mockReturnValue(chain([]));
  materialListingModel.find.mockReturnValue(chain([]));
  transactionModel.find.mockReturnValue(chain([]));
});

test('no filters → all non-deleted payments', async () => {
  expect(await buildQuery({})).toEqual({ is_deleted: '0' });
});

test('status, method, reconciliation and amount range', async () => {
  const q = await buildQuery({ status: 'SUCCESS', method: 'UPI', reconciliation: 'true', minAmount: '100', maxAmount: '2000.5' });
  expect(q).toMatchObject({ status: 'SUCCESS', method: 'upi', reconciliationRequired: true, amountPaise: { $gte: 10000, $lte: 200050 } });
});

test('refund filter: any refund activity vs none', async () => {
  const any = await buildQuery({ refund: 'any' });
  expect(any.$and[0].$or).toEqual([{ status: { $in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } }, { 'refunds.0': { $exists: true } }]);
  const none = await buildQuery({ refund: 'NONE' });
  expect(none.$and[0]).toMatchObject({ 'refunds.0': { $exists: false } });
});

test('date range: a bare "To" date includes the whole day; reversed range is rejected', async () => {
  const q = await buildQuery({ from: '2026-10-01', to: '2026-10-11' });
  expect(q.createdAt.$gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  expect(q.createdAt.$lte.toISOString()).toBe('2026-10-11T23:59:59.999Z');
  await expect(buildQuery({ from: '2026-10-12', to: '2026-10-11' })).rejects.toThrow(PaymentHistoryError);
  await expect(buildQuery({ from: 'not-a-date' })).rejects.toThrow('Invalid date');
});

test('unknown values and operator objects are rejected / ignored, never passed to Mongo', async () => {
  await expect(buildQuery({ status: 'PAID' })).rejects.toThrow(PaymentHistoryError);
  await expect(buildQuery({ refund: 'maybe' })).rejects.toThrow(PaymentHistoryError);
  await expect(buildQuery({ minAmount: '-5' })).rejects.toThrow(PaymentHistoryError);
  // ?status[$ne]=x arrives as an object → treated as empty
  expect(await buildQuery({ status: { $ne: 'x' }, q: { $gt: '' } })).toEqual({ is_deleted: '0' });
});

test('search matches Razorpay ids (regex-escaped), people, listings and the order number', async () => {
  userModel.find.mockReturnValue(chain([{ _id: U1 }]));
  materialListingModel.find.mockReturnValue(chain([{ _id: L1 }]));
  transactionModel.find.mockReturnValue(chain([{ _id: T1 }]));
  const q = await buildQuery({ q: 'order_Tm.*' });
  const or = q.$and[0].$or;
  expect(or[0].providerOrderId.source).toBe('order_Tm\\.\\*');
  expect(or).toEqual(expect.arrayContaining([{ buyer: { $in: [U1] } }, { seller: { $in: [U1] } }, { transaction: { $in: [T1] } }]));

  const byRef = await buildQuery({ q: '#000000A1' });
  expect(byRef.$and[0].$or).toEqual(expect.arrayContaining([{ $expr: { $regexMatch: { input: { $toString: '$transaction' }, regex: '000000a1$' } } }]));
});
