/**
 * Admin Commission & Revenue Analytics — the money classification is pure
 * (classify / aggregate), so these fixtures pin that the page's numbers are
 * exactly the sums of the underlying order + payout records:
 *  - gross order value is never counted as revenue,
 *  - only SETTLED commission (seller payout PAID) is "earned",
 *  - refunded orders move to "reversed", pending/held are separate,
 *  - GST is split out only where it was recorded on the order,
 *  - totals reconcile with the commission on PAID payouts.
 */
jest.mock('../model/transaction.model', () => ({ aggregate: jest.fn(), collection: { name: 'transactions' } }));
jest.mock('../model/materialListing.model', () => ({ collection: { name: 'material_listings' } }));
jest.mock('../model/payout.model', () => ({ collection: { name: 'payouts' } }));
jest.mock('../model/materialCategory.model', () => ({ find: jest.fn() }));

const transactionModel = require('../model/transaction.model');
const materialCategoryModel = require('../model/materialCategory.model');
const svc = require('../service/admin/revenueAnalytics.service');

const CEMENT = '64b0000000000000000000e1';
const STEEL = '64b0000000000000000000e2';
const names = new Map([[CEMENT, 'Cement'], [STEEL, 'TMT Steel']]);
const day = (d) => new Date(`2026-09-${String(d).padStart(2, '0')}T06:00:00Z`);

// ₹10,000 at 8.9% → ₹890 (GST incl. 18% → ₹135.76), seller ₹9,110.
const rows = [
  { _id: 'a', category: CEMENT, status: 'COMPLETED', escrowStatus: 'RELEASED', commissionStatus: 'SETTLED', agreedAmount: 10000, platformCommissionPct: 8.9, platformCommissionAmount: 890, commissionTaxAmount: 135.76, sellerSettlementAmount: 9110, buyerFeeAmount: 300, payoutStatus: 'PAID', payoutNet: 9110, payoutCommission: 890, paymentConfirmedAt: day(1) },
  // Buyer confirmed; payout processing → commission accrued, settlement pending.
  { _id: 'b', category: CEMENT, status: 'COMPLETED', escrowStatus: 'RELEASE_PENDING', commissionStatus: 'COLLECTED', agreedAmount: 5000, platformCommissionPct: 8.9, platformCommissionAmount: 445, sellerSettlementAmount: 4555, buyerFeeAmount: 150, payoutStatus: 'PROCESSING', payoutNet: 4555, payoutCommission: 445, paymentConfirmedAt: day(2) },
  // Paid & held, awaiting handover.
  { _id: 'c', category: STEEL, status: 'PAYMENT_CONFIRMED', escrowStatus: 'HELD', commissionStatus: 'COLLECTED', agreedAmount: 20000, platformCommissionPct: 7.5, platformCommissionAmount: 1500, sellerSettlementAmount: 18500, buyerFeeAmount: 400, paymentConfirmedAt: day(2) },
  // Refunded → reversed, excluded from gross and revenue.
  { _id: 'd', category: STEEL, status: 'REFUNDED', escrowStatus: 'REFUNDED', commissionStatus: 'REFUNDED', agreedAmount: 8000, platformCommissionPct: 7.5, platformCommissionAmount: 600, sellerSettlementAmount: 7400, buyerFeeAmount: 160, paymentConfirmedAt: day(3) },
  // Settled, no GST snapshot (older order) → flagged, not guessed.
  { _id: 'e', category: STEEL, status: 'COMPLETED', escrowStatus: 'RELEASED', commissionStatus: 'SETTLED', agreedAmount: 1000, platformCommissionPct: 7.5, platformCommissionAmount: 75, sellerSettlementAmount: 925, buyerFeeAmount: 20, payoutStatus: 'PAID', payoutNet: 925, payoutCommission: 75, paymentConfirmedAt: day(3) },
  // Disputed — held, not earned.
  { _id: 'f', category: null, status: 'DISPUTED', escrowStatus: 'DISPUTED', commissionStatus: 'COLLECTED', agreedAmount: 3000, platformCommissionPct: 8.9, platformCommissionAmount: 267, sellerSettlementAmount: 2733, buyerFeeAmount: 90, paymentConfirmedAt: day(4) },
];

describe('aggregate', () => {
  const { summary, categories, series } = svc.aggregate(rows, { categoryNames: names });

  test('KPI totals equal the sums of the order records', () => {
    expect(summary.orders).toBe(6);
    expect(summary.gross).toBe(10000 + 5000 + 20000 + 1000 + 3000); // refunded order excluded
    expect(summary.refundedValue).toBe(8000);
    expect(summary.earned).toBe(890 + 75);                           // SETTLED only
    expect(summary.accrued).toBe(445 + 1500 + 267);                  // COLLECTED, not refunded
    expect(summary.reversed).toBe(600);
    expect(summary.tax).toBe(135.76);
    expect(summary.netCommissionRevenue).toBe(965 - 135.76);
    expect(summary.taxComplete).toBe(false);                         // order "e" has no tax snapshot
    expect(summary.earnedWithoutTax).toBe(1);
    expect(summary.pendingSettlement).toBe(4555);
    expect(summary.held).toBe(20000);
    expect(summary.disputed).toBe(3000);
    expect(summary.payoutsPaid).toBe(9110 + 925);
    expect(summary.completed).toBe(3);
    expect(summary.buyerFees).toBe(300 + 150 + 400 + 20 + 90);
  });

  test('gross order value is not labelled or counted as revenue', () => {
    expect(summary.netCommissionRevenue).toBeLessThan(summary.gross / 10);
  });

  test('earned commission reconciles with the commission on PAID payouts', () => {
    expect(summary.reconciliation).toEqual({ earnedFromOrders: 965, commissionOnPaidPayouts: 965, matches: true });
    const broken = svc.aggregate([{ ...rows[0], payoutCommission: 800 }]);
    expect(broken.summary.reconciliation.matches).toBe(false);
  });

  test('category breakdown uses configured category names and per-order rates', () => {
    const cement = categories.find((c) => c.category === 'Cement');
    expect(cement).toMatchObject({ orders: 2, grossValue: 15000, grossCommission: 1335, commissionRates: [8.9], earned: 890, sellerPayouts: 9110, reversed: 0 });
    expect(cement.netCommissionRevenue).toBe(754.24);
    const steel = categories.find((c) => c.category === 'TMT Steel');
    expect(steel).toMatchObject({ orders: 3, grossValue: 21000, reversed: 600, refundedValue: 8000, commissionRates: [7.5], commissionTax: null });
    expect(categories.find((c) => c.category === 'Uncategorised')).toMatchObject({ orders: 1, grossValue: 3000 });
  });

  test('daily series sums to the totals', () => {
    expect(series.map((s) => s.period)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
    expect(series.reduce((a, s) => a + s.grossValue, 0)).toBe(summary.gross);
    expect(series.reduce((a, s) => a + s.commissionEarned, 0)).toBe(summary.earned);
  });

  test('money is summed in paise (no float drift)', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...rows[0], _id: String(i), platformCommissionAmount: 0.1, payoutCommission: 0.1, commissionTaxAmount: 0.01 }));
    const r = svc.aggregate(many).summary;
    expect(r.earned).toBe(100);
    expect(r.tax).toBe(10);
  });
});

describe('buildMatch', () => {
  test('only paid orders, filters validated', () => {
    expect(svc.buildMatch({}).match).toMatchObject({ is_deleted: '0', paymentConfirmedAt: { $ne: null } });
    expect(svc.buildMatch({ status: 'COMPLETED', settlementStatus: 'RELEASED', sellerType: 'BUSINESS_STORE' }).match)
      .toMatchObject({ status: 'COMPLETED', escrowStatus: 'RELEASED', commissionSellerType: 'BUSINESS_STORE' });
    expect(() => svc.buildMatch({ status: 'PAID; drop' })).toThrow(svc.AnalyticsError);
    expect(() => svc.buildMatch({ sellerType: 'ANY' })).toThrow(svc.AnalyticsError);
    expect(() => svc.buildMatch({ orderId: '{"$gt":""}' })).toThrow(svc.AnalyticsError);
    expect(() => svc.buildMatch({ from: '2026-10-02', to: '2026-10-01' })).toThrow(/before/);
  });

  test('"To" date includes the whole day', () => {
    const { match } = svc.buildMatch({ from: '2026-10-01', to: '2026-10-01' });
    expect(match.paymentConfirmedAt.$lte.toISOString()).toBe('2026-10-01T23:59:59.999Z');
  });

  test('order search accepts the #REF shown to users', () => {
    expect(svc.buildMatch({ orderId: '#1A2B3C4D' }).match.$expr.$regexMatch.regex).toBe('1a2b3c4d$');
  });
});

describe('overview / export', () => {
  beforeEach(() => {
    materialCategoryModel.find.mockReturnValue({ select: () => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: CEMENT, name: 'Cement' }, { _id: STEEL, name: 'TMT Steel' }]) }) }) });
  });

  test('overview returns totals from the aggregated records and the category filter list', async () => {
    transactionModel.aggregate.mockReturnValue({ allowDiskUse: () => Promise.resolve(rows) });
    const res = await svc.overview({ from: '2026-09-01', to: '2026-09-30' });
    expect(res.summary.gross).toBe(39000);
    expect(res.granularity).toBe('day');
    expect(res.filterOptions.categories.map((c) => c.name)).toEqual(['Cement', 'TMT Steel']);
  });

  test('CSV export neutralises spreadsheet formulas', async () => {
    transactionModel.aggregate.mockReturnValue({ allowDiskUse: () => Promise.resolve([{ rows: [{ ...rows[0], _id: '64b0000000000000000000a1', listingTitle: '=HYPERLINK("x")' }], count: [{ n: 1 }] }]) });
    const { csv } = await svc.exportCsv({});
    expect(csv.split('\n')[0]).toMatch(/^Order,Transaction ID/);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain('#000000A1');
  });
});
