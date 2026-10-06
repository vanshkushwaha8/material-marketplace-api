// All monetary math happens in integer paise (1 INR = 100 paise) to avoid
// floating-point drift on financial calculations — spec's "proper
// decimal/money handling, avoid unsafe floating point" requirement.
// Rupee-facing schema fields still store plain rupee numbers; this helper
// is the only place that crosses between the two representations.
function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}
function fromPaise(paise) {
  return Math.round(paise) / 100;
}
function calculateCommissionPaise(grossAmountPaise, commissionPct) {
  const commissionAmountPaise = Math.round(grossAmountPaise * (Number(commissionPct) / 100));
  const sellerSettlementPaise = grossAmountPaise - commissionAmountPaise;
  return { commissionAmountPaise, sellerSettlementPaise };
}
// amount / quantity, rounded to the nearest paisa via integer math instead
// of `.toFixed(2)` on a raw float division — same "no unsafe floating point
// for money" rule money.helper.js exists to centralize, applied to the
// unit-price-from-total derivation used when an offer/counter is stored.
function unitPriceFromAmount(amount, quantity) {
  if (!quantity) return 0;
  return fromPaise(Math.round(toPaise(amount) / Number(quantity)));
}
// What the buyer actually pays for a transaction: product price + buyer
// convenience fee. Transactions created before the fee existed have no
// totalPayable and pay agreedAmount, exactly as before.
function payableAmount(txn) {
  return txn.totalPayable != null ? txn.totalPayable : txn.agreedAmount;
}

// Fee on the final product price, rounded to the paisa.
function buyerFeeFor(agreedAmount, pct) {
  const feePaise = Math.round(toPaise(agreedAmount) * (Number(pct) || 0) / 100);
  return { buyerFeeAmount: fromPaise(feePaise), totalPayable: fromPaise(toPaise(agreedAmount) + feePaise) };
}

module.exports = { toPaise, fromPaise, calculateCommissionPaise, unitPriceFromAmount, payableAmount, buyerFeeFor };