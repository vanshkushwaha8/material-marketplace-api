/**
 * Escrow state machine (escrow.service.js#transition) against an in-memory
 * transaction collection with real compare-and-set semantics: full happy
 * path, failure/refund/dispute paths, invalid & duplicate transitions,
 * concurrent races, idempotency keys and legacy backfill.
 */
const mockDb = new Map();
const mockClone = (o) => JSON.parse(JSON.stringify(o));

function mockMatches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), doc);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) return cond.$in.includes(v);
      if ('$exists' in cond) return cond.$exists ? v !== undefined : v === undefined;
      if ('$nin' in cond) return !cond.$nin.includes(v);
    }
    return String(v) === String(cond);
  });
}
function mockApply(doc, update) {
  for (const [k, v] of Object.entries(update.$set || {})) {
    const parts = k.split('.'); let o = doc;
    parts.slice(0, -1).forEach((p) => { o[p] = o[p] || {}; o = o[p]; });
    o[parts[parts.length - 1]] = v;
  }
  for (const [k, v] of Object.entries(update.$push || {})) {
    doc[k] = doc[k] || [];
    if (v && v.$each) doc[k].push(...v.$each); else doc[k].push(v);
  }
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
}
const mockLean = (v) => ({ lean: () => Promise.resolve(v ? mockClone(v) : null) });

jest.mock('../model/transaction.model', () => ({
  findById: jest.fn((id) => mockLean(mockDb.get(String(id)))),
  findOneAndUpdate: jest.fn((filter, update) => {
    const doc = mockDb.get(String(filter._id));
    if (!doc || !mockMatches(doc, { ...filter, _id: undefined === filter._id ? undefined : doc._id })) return mockLean(null);
    mockApply(doc, update);
    return mockLean(doc);
  }),
  updateOne: jest.fn((filter, update) => {
    const doc = mockDb.get(String(filter._id));
    if (doc && mockMatches(doc, { ...filter, _id: doc._id })) mockApply(doc, update);
    return Promise.resolve({});
  }),
}));
jest.mock('../model/payout.model', () => ({ findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null), createAuditLogAdmin: jest.fn().mockResolvedValue(null) }));

const { createAuditLogAdmin } = require('../helper/audit.helper');
const escrow = require('../service/app/escrow.service');
const { ESCROW_TRANSITIONS } = require('../constants/escrow.constants');

const ID = '64b0000000000000000000a1';
const ADMIN = { type: 'admin', id: '64b0000000000000000000ff' };
const SYS = { type: 'system' };
const seed = (o = {}) => mockDb.set(ID, { _id: ID, status: 'PAYMENT_PENDING', escrowStatus: 'INITIATED', escrowHistory: [], agreedAmount: 1000, ...o });
const go = (action, extra = {}) => escrow.transition({ transactionId: ID, action, actor: SYS, ...extra });
const state = () => mockDb.get(ID).escrowStatus;

beforeEach(() => { mockDb.clear(); jest.clearAllMocks(); seed(); });

test('happy path: INITIATED → … → RELEASED, every step on the ledger', async () => {
  for (const a of ['START_PAYMENT', 'PAYMENT_CAPTURED', 'HOLD', 'MARK_DELIVERED', 'BUYER_CONFIRM', 'DEDUCT_COMMISSION', 'QUEUE_RELEASE', 'RELEASE_CONFIRMED']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await go(a);
    expect(r.applied).toBe(true);
  }
  expect(state()).toBe('RELEASED');
  const h = mockDb.get(ID).escrowHistory;
  expect(h.map((e) => e.to)).toEqual(['PROCESSING', 'PAID', 'HELD', 'DELIVERED', 'BUYER_CONFIRMED', 'COMMISSION_DEDUCTED', 'RELEASE_PENDING', 'RELEASED']);
  expect(h[1]).toMatchObject({ from: 'PROCESSING', to: 'PAID', action: 'PAYMENT_CAPTURED', actorType: 'system' });
});

test('HELD → RELEASED directly is rejected (needs delivery + buyer confirmation + commission)', async () => {
  seed({ escrowStatus: 'HELD' });
  await expect(go('RELEASE_CONFIRMED')).rejects.toMatchObject({ statusCode: 409, errorCode: 'INVALID_TRANSITION' });
  await expect(go('QUEUE_RELEASE')).rejects.toMatchObject({ errorCode: 'INVALID_TRANSITION' });
  expect(state()).toBe('HELD');
});

test('seller delivery alone never releases money', async () => {
  seed({ escrowStatus: 'HELD' });
  await go('MARK_DELIVERED');
  expect(state()).toBe('DELIVERED');
  await expect(go('DEDUCT_COMMISSION')).rejects.toMatchObject({ errorCode: 'INVALID_TRANSITION' });
});

test('terminal states cannot be re-applied: RELEASED → release / refund, REFUNDED → refund', async () => {
  seed({ escrowStatus: 'RELEASED' });
  const again = await go('RELEASE_CONFIRMED');            // duplicate (e.g. webhook redelivery) → no-op
  expect(again).toMatchObject({ applied: false, duplicate: true });
  await expect(go('REQUEST_REFUND')).rejects.toMatchObject({ statusCode: 409 });
  seed({ escrowStatus: 'REFUNDED' });
  expect(await go('REFUND_CONFIRMED')).toMatchObject({ applied: false, duplicate: true });
  await expect(go('REQUEST_REFUND')).rejects.toMatchObject({ statusCode: 409 });
  await expect(go('REFUND_CONFIRMED', { throwIfApplied: true })).rejects.toMatchObject({ errorCode: 'ALREADY_APPLIED' });
});

test('two concurrent identical transitions: exactly one applies', async () => {
  seed({ escrowStatus: 'RELEASE_PENDING' });
  const [a, b] = await Promise.all([go('RELEASE_CONFIRMED'), go('RELEASE_CONFIRMED')]);
  expect([a.applied, b.applied].sort()).toEqual([false, true]);
  expect(mockDb.get(ID).escrowHistory.filter((e) => e.to === 'RELEASED')).toHaveLength(1);
});

test('concurrent conflicting actions: release vs refund — only one wins', async () => {
  seed({ escrowStatus: 'ADMIN_REVIEW' });
  const results = await Promise.allSettled([
    go('ADMIN_APPROVE_RELEASE', { actor: ADMIN }),
    go('REQUEST_REFUND', { actor: ADMIN }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled' && r.value.applied)).toHaveLength(1);
  expect(['COMMISSION_DEDUCTED', 'REFUND_PENDING']).toContain(state());
});

test('same idempotency key is applied once', async () => {
  seed({ escrowStatus: 'REFUND_FAILED' });
  const first = await go('REQUEST_REFUND', { actor: ADMIN, idempotencyKey: 'click-1' });
  expect(first.applied).toBe(true);
  await go('REFUND_FAILED');                                    // provider failed again
  const replay = await go('REQUEST_REFUND', { actor: ADMIN, idempotencyKey: 'click-1' }); // same click retried
  expect(replay).toMatchObject({ applied: false, duplicate: true });
  expect(state()).toBe('REFUND_FAILED');
  expect(createAuditLogAdmin).toHaveBeenCalledWith(expect.objectContaining({ adminId: ADMIN.id, fromState: 'REFUND_FAILED', toState: 'REFUND_PENDING' }));
});

test('payment failure and retry: PROCESSING → FAILED → PROCESSING → PAID', async () => {
  await go('START_PAYMENT');
  await go('PAYMENT_FAILED');
  expect(state()).toBe('FAILED');
  await go('START_PAYMENT');
  await go('PAYMENT_CAPTURED');
  expect(state()).toBe('PAID');
});

test('refund path incl. failure + admin retry', async () => {
  seed({ escrowStatus: 'HELD' });
  await go('REQUEST_REFUND', { actor: ADMIN });
  await go('REFUND_FAILED');
  expect(state()).toBe('REFUND_FAILED');
  await go('REQUEST_REFUND', { actor: ADMIN });
  await go('REFUND_CONFIRMED');
  expect(state()).toBe('REFUNDED');
});

test('dispute → admin review → release or refund', async () => {
  seed({ escrowStatus: 'DELIVERED' });
  await go('RAISE_DISPUTE', { actor: { type: 'buyer', id: '64b0000000000000000000b1' } });
  await go('START_ADMIN_REVIEW', { actor: ADMIN });
  await go('ADMIN_APPROVE_RELEASE', { actor: ADMIN });
  await go('QUEUE_RELEASE', { actor: ADMIN });
  expect(state()).toBe('RELEASE_PENDING');
  // a disputed order cannot be released without admin review
  seed({ escrowStatus: 'DISPUTED' });
  await expect(go('QUEUE_RELEASE')).rejects.toMatchObject({ errorCode: 'INVALID_TRANSITION' });
});

test('release failure → REQUIRES_ADMIN_ACTION → admin retry → released', async () => {
  seed({ escrowStatus: 'RELEASE_PENDING' });
  await go('RELEASE_FAILED');
  expect(state()).toBe('REQUIRES_ADMIN_ACTION');
  await go('ADMIN_RETRY_RELEASE', { actor: ADMIN });
  await go('RELEASE_CONFIRMED');
  expect(state()).toBe('RELEASED');
});

test('extra `where` guards are part of the atomic check', async () => {
  seed({ escrowStatus: 'INITIATED', status: 'CANCELLED' });
  await expect(go('PAYMENT_CAPTURED', { where: { status: 'PAYMENT_PENDING' } })).rejects.toMatchObject({ errorCode: 'CONCURRENT_UPDATE' });
  expect(state()).toBe('INITIATED');
});

test('legacy transaction without escrowStatus is backfilled once, then transitions', async () => {
  mockDb.set(ID, { _id: ID, status: 'PAYMENT_CONFIRMED', escrowHistory: [] });
  const r = await go('MARK_DELIVERED');
  expect(r.applied).toBe(true);
  expect(mockDb.get(ID).escrowHistory.map((e) => e.action)).toEqual(['BACKFILL', 'MARK_DELIVERED']);
});

test('every transition target is a known state and every action has a source', () => {
  const states = new Set(Object.values(require('../constants/escrow.constants').ESCROW_STATES));
  for (const [action, rule] of Object.entries(ESCROW_TRANSITIONS)) {
    expect(states.has(rule.to)).toBe(true);
    expect(rule.from.length).toBeGreaterThan(0);
    rule.from.forEach((f) => expect(states.has(f)).toBe(true));
    expect(action).toMatch(/^[A-Z_]+$/);
  }
});
