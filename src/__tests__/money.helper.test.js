const { toPaise, fromPaise, calculateCommissionPaise } = require('../helper/money.helper');

describe('money.helper', () => {
  test('toPaise converts rupees to integer paise without floating-point drift', () => {
    expect(toPaise(10)).toBe(1000);
    expect(toPaise(10.5)).toBe(1050);
    expect(toPaise(0.1)).toBe(10); // classic float trap (0.1 * 100 !== 10 in raw JS) — must come out exact
  });

  test('fromPaise converts back to rupees', () => {
    expect(fromPaise(1000)).toBe(10);
    expect(fromPaise(1050)).toBe(10.5);
  });

  test('calculateCommissionPaise splits gross amount into commission + settlement with no rounding leak', () => {
    const { commissionAmountPaise, sellerSettlementPaise } = calculateCommissionPaise(1000000, 8.9); // ₹10,000 at 8.9%
    expect(commissionAmountPaise).toBe(89000); // ₹890
    expect(sellerSettlementPaise).toBe(911000); // ₹9,110
    expect(commissionAmountPaise + sellerSettlementPaise).toBe(1000000); // must always sum back to the gross exactly
  });

  test('commission + settlement always sums to the gross amount across many rates (no paisa lost to rounding)', () => {
    const gross = 733333; // an amount that doesn't divide evenly
    for (const pct of [0, 2, 8.9, 15, 33.33, 100]) {
      const { commissionAmountPaise, sellerSettlementPaise } = calculateCommissionPaise(gross, pct);
      expect(commissionAmountPaise + sellerSettlementPaise).toBe(gross);
    }
  });
});